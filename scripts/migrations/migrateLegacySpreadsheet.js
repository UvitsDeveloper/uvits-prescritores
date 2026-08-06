// Migração única dos prescritores recrutados via chat antes do sistema
// existir (planilha "Nutricionistas e Médicos", aba "Importação Uvits").
// Ver database/migrations/2026-07-29-dados-legados.sql para a mudança de schema
// necessária antes de rodar com --commit.
//
// Uso:
//   MIGRATION_DATA_FILE=/caminho/dados.json node scripts/migrations/migrateLegacySpreadsheet.js
//   MIGRATION_DATA_FILE=/caminho/dados.json node scripts/migrations/migrateLegacySpreadsheet.js --commit
//
// Sem --commit roda em modo dry-run (padrão, seguro): só leitura, nenhuma
// escrita em Postgres ou Shopify. O arquivo de dados nunca deve ficar dentro
// deste repositório (contém dados pessoais reais) — sempre referenciado por
// caminho externo via MIGRATION_DATA_FILE.

const fs = require('fs');
const path = require('path');

// Carrega .env.production.local / .env.local manualmente — este projeto não
// depende de `dotenv` (roda em produção via Vercel, que injeta as env vars
// sozinho); só um script standalone como este precisa ler o arquivo local
// diretamente. Nunca sobrescreve uma env var já definida no processo (ex.:
// passada explicitamente na linha de comando) nem entre os dois arquivos —
// o primeiro que definir uma chave vence.
(function carregarEnvLocal() {
  const candidatos = ['.env.production.local', '.env.local'];
  for (const nome of candidatos) {
    const envPath = path.join(__dirname, '..', '..', nome);
    if (fs.existsSync(envPath)) carregarArquivoEnv(envPath);
  }
})();

function carregarArquivoEnv(envPath) {
  const conteudo = fs.readFileSync(envPath, 'utf-8');
  for (const linha of conteudo.split('\n')) {
    const l = linha.trim();
    if (!l || l.startsWith('#')) continue;
    const idx = l.indexOf('=');
    if (idx === -1) continue;
    const chave = l.slice(0, idx).trim();
    let valor = l.slice(idx + 1).trim();
    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1);
    }
    if (chave && !(chave in process.env)) process.env[chave] = valor;
  }
}

const { sql } = require('@vercel/postgres');
const { validarCpf } = require('../../api/_cpf');
const { sincronizarComShopify, confirmarCpfNaShopify } = require('../../api/_shopifySync');

const COMMIT = process.argv.includes('--commit');
const DATA_FILE = process.env.MIGRATION_DATA_FILE;

if (!DATA_FILE) {
  console.error('Defina MIGRATION_DATA_FILE apontando pro JSON gerado a partir da aba "Importação Uvits".');
  process.exit(1);
}

// ── Normalização ────────────────────────────────────────────────────────────
function normalizarEmail(email) {
  const v = email ? String(email).trim().toLowerCase() : '';
  return v || null;
}

function normalizarConselho(conselho) {
  const v = conselho ? String(conselho).trim().toUpperCase() : '';
  return v || null;
}

function normalizarTexto(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function derivarProfissao(crnCrm) {
  const v = String(crnCrm || '').trim().toUpperCase();
  if (v.startsWith('CRN')) return 'Nutricionista';
  if (v.startsWith('CRM')) return 'Médico(a)';
  return null;
}

function normalizarCpfDigitos(cpf) {
  const digitos = String(cpf || '').replace(/\D/g, '');
  return digitos.length === 11 ? digitos : null;
}

// Aceita string ISO (já normalizada pelo conversor da planilha). Rejeita
// datas implausíveis (ex.: o bug real encontrado — ano 7195 por erro de
// digitação) em vez de confiar cegamente na fonte.
function normalizarDataNascimento(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const ano = d.getFullYear();
  if (ano < 1900 || ano > new Date().getFullYear()) return null;
  return iso.slice(0, 10);
}

function normalizarRegistro(raw) {
  const email = normalizarEmail(raw.email);
  const conselho = normalizarConselho(raw.crn_crm);
  const profissao = derivarProfissao(raw.crn_crm);
  const cpfDigitos = raw.cpf_valido === 'SIM' ? normalizarCpfDigitos(raw.cpf_normalizado) : null;
  const cpfRevalidado = cpfDigitos ? validarCpf(cpfDigitos) : false;
  const dataNascimento = normalizarDataNascimento(raw.data_nascimento);

  const observacoes = [];
  // A aba "Importação Uvits" já vem com o campo em branco quando a data é
  // corrompida (ex.: Vanessa Cristiane Pereira Costa) — por isso a checagem
  // é contra o valor BRUTO da aba Página1, não contra raw.data_nascimento
  // (que já pode estar nulo mesmo quando existe um valor corrompido na
  // origem). Registros que nunca tiveram data de nascimento (raw bruto
  // também vazio) não geram observação — não é um caso de corrupção.
  if (!dataNascimento && raw.data_nascimento_bruta_pagina1) {
    observacoes.push(
      'Data de nascimento ausente ou inválida no cadastro. ' +
        `Valor bruto original (aba Página1): ${raw.data_nascimento_bruta_pagina1}. ` +
        'Confirmar diretamente com o prescritor antes de preencher.'
    );
  }
  if (raw.crn_crm && !profissao) {
    observacoes.push(`Registro profissional "${raw.crn_crm}" não corresponde a CRN nem CRM — profissão não determinada automaticamente.`);
  }
  if (raw.cpf_valido === 'SIM' && !cpfRevalidado) {
    observacoes.push('CPF marcado como válido na planilha, mas reprovado na revalidação do dígito verificador nesta migração — tratado como inválido.');
  }

  const dadosCompletos = !!(email && profissao && conselho && cpfRevalidado);
  const prontoParaAtivar = raw.status_desejado === 'ATIVO' && dadosCompletos;

  return {
    idLegado: raw.id_legado,
    linhaOrigem: raw.linha_original,
    nome: normalizarTexto(raw.nome),
    email,
    whatsapp: normalizarTexto(raw.telefone),
    profissao,
    conselho,
    cpfDigitos: cpfRevalidado ? cpfDigitos : null,
    dataNascimento,
    instagram: normalizarTexto(raw.instagram),
    endereco: normalizarTexto(raw.endereco_legado),
    prontoParaAtivar,
    dadosMigracao: {
      brinde_legado: normalizarTexto(raw.brinde_legado),
      cupom_legado: normalizarTexto(raw.cupom_legado),
      enviado_legado: normalizarTexto(raw.enviado_legado),
      status_importacao_planilha: raw.status_importacao,
      pendencias_criticas_planilha: raw.pendencias_criticas,
      pendencias_nao_bloqueantes_planilha: raw.pendencias_nao_bloqueantes,
      observacoes,
      migrado_em: new Date().toISOString(),
    },
  };
}

// ── Busca de existente: ID legado → e-mail → conselho ──────────────────────
// (conselho é só proteção extra contra a constraint única do banco; nunca
// substitui a ordem pedida — CPF não é chave de busca porque não é
// armazenado no Postgres; ver docs/architecture.md.)
async function buscarExistente(registro) {
  if (registro.idLegado) {
    const { rows } = await sql`SELECT * FROM prescritores WHERE id_legado = ${registro.idLegado} LIMIT 1`;
    if (rows.length) return { row: rows[0], metodo: 'id_legado' };
  }
  if (registro.email) {
    const { rows } = await sql`SELECT * FROM prescritores WHERE email = ${registro.email} LIMIT 1`;
    if (rows.length) return { row: rows[0], metodo: 'email' };
  }
  if (registro.conselho) {
    const { rows } = await sql`SELECT * FROM prescritores WHERE conselho = ${registro.conselho} LIMIT 1`;
    if (rows.length) return { row: rows[0], metodo: 'conselho' };
  }
  return null;
}

async function inserir(registro) {
  const { rows } = await sql`
    INSERT INTO prescritores (
      nome, email, whatsapp, profissao, conselho, status, origem,
      id_legado, linha_origem_planilha, data_nascimento, instagram, endereco, dados_migracao
    ) VALUES (
      ${registro.nome}, ${registro.email}, ${registro.whatsapp}, ${registro.profissao}, ${registro.conselho},
      'pendente', 'importado',
      ${registro.idLegado}, ${registro.linhaOrigem}, ${registro.dataNascimento}, ${registro.instagram},
      ${registro.endereco}, ${JSON.stringify(registro.dadosMigracao)}
    )
    RETURNING *
  `;
  return rows[0];
}

// Quando já existe um cadastro (encontrado por e-mail/conselho/id_legado),
// o valor da planilha para um campo já preenchido nunca sobrescreve o que
// já está no banco (ver atualizarComPreservacao) — mas se os dois
// divergirem, o valor da planilha não pode simplesmente desaparecer.
// Guardamos a divergência em dados_migracao pra revisão manual.
function calcularDivergencias(existente, registro) {
  const campos = [
    ['nome', existente.nome, registro.nome],
    ['email', existente.email, registro.email],
    ['whatsapp', existente.whatsapp, registro.whatsapp],
    ['profissao', existente.profissao, registro.profissao],
    ['conselho', existente.conselho, registro.conselho],
  ];
  const divergencias = [];
  for (const [campo, valorAtual, valorPlanilha] of campos) {
    if (valorAtual && valorPlanilha && String(valorAtual).trim() !== String(valorPlanilha).trim()) {
      divergencias.push({ campo, valor_atual_no_banco: valorAtual, valor_na_planilha: valorPlanilha });
    }
  }
  return divergencias;
}

// Nunca apaga campo já preenchido — só completa o que está vazio. Metadado
// de pipeline (id_legado, linha, dados_migracao) é sempre atualizado.
async function atualizarComPreservacao(id, registro) {
  const { rows } = await sql`
    UPDATE prescritores SET
      email                  = COALESCE(email, ${registro.email}),
      whatsapp               = COALESCE(whatsapp, ${registro.whatsapp}),
      profissao              = COALESCE(profissao, ${registro.profissao}),
      conselho                = COALESCE(conselho, ${registro.conselho}),
      data_nascimento        = COALESCE(data_nascimento, ${registro.dataNascimento}),
      instagram              = COALESCE(instagram, ${registro.instagram}),
      endereco               = COALESCE(endereco, ${registro.endereco}),
      id_legado              = COALESCE(id_legado, ${registro.idLegado}),
      linha_origem_planilha  = COALESCE(linha_origem_planilha, ${registro.linhaOrigem}),
      dados_migracao         = COALESCE(dados_migracao, '{}'::jsonb) || ${JSON.stringify(registro.dadosMigracao)}::jsonb
    WHERE id = ${id}
    RETURNING *
  `;
  return rows[0];
}

// Só promove pendente → aprovado quando Shopify + CPF confirmarem de
// verdade. Nunca mexe num registro que já não está em "pendente" (evita
// sobrescrever um estado real mais avançado).
async function tentarPromoverParaAprovado(row, registro) {
  if (!registro.prontoParaAtivar) return { promovido: false, motivo: 'dados insuficientes para ativação — permanece pendente' };
  if (row.status !== 'pendente') return { promovido: false, motivo: `status atual (${row.status}) não é "pendente" — não mexido` };

  let shopifyCustomerId = row.shopify_customer_id;
  if (!shopifyCustomerId) {
    const sincronizacao = await sincronizarComShopify({ email: registro.email, nome: registro.nome });
    if (!sincronizacao.ok) return { promovido: false, motivo: `falha ao criar/vincular cliente Shopify: ${sincronizacao.error}` };
    shopifyCustomerId = sincronizacao.shopifyCustomerId;
    await sql`UPDATE prescritores SET shopify_customer_id = ${shopifyCustomerId} WHERE id = ${row.id}`;
  }

  let cpfConfirmado = row.cpf_confirmado;
  if (!cpfConfirmado) {
    const confirmacao = await confirmarCpfNaShopify({ shopifyCustomerId, cpf: registro.cpfDigitos });
    if (!confirmacao.ok) return { promovido: false, motivo: `falha ao confirmar CPF na Shopify: ${confirmacao.error || confirmacao.mensagem}` };
    cpfConfirmado = true;
  }

  const { rows } = await sql`
    UPDATE prescritores SET status = 'aprovado', cpf_confirmado = ${cpfConfirmado} WHERE id = ${row.id} RETURNING *
  `;
  return { promovido: true, row: rows[0] };
}

// ── Backup real antes de qualquer escrita ───────────────────────────────────
async function fazerBackup() {
  const { rows } = await sql`SELECT * FROM prescritores`;
  const backupPath = path.join(path.dirname(DATA_FILE), `backup-prescritores-${Date.now()}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(rows, null, 2), 'utf-8');
  console.log(`Backup de ${rows.length} linhas salvo em: ${backupPath}`);
  return backupPath;
}

// ── Execução principal ──────────────────────────────────────────────────────
async function main() {
  const brutos = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  console.log(`${brutos.length} registros lidos de ${DATA_FILE}`);
  console.log(`Modo: ${COMMIT ? 'COMMIT (escreve de verdade)' : 'DRY-RUN (só leitura, nenhuma escrita)'}\n`);

  if (COMMIT) {
    await fazerBackup();
  }

  const resultado = {
    processados: 0,
    criados: 0,
    atualizados: 0,
    promovidosAprovado: 0,
    mantidosPendente: 0,
    erros: [],
    conflitos: [],
    linhas: [],
  };

  for (const raw of brutos) {
    resultado.processados++;
    const registro = normalizarRegistro(raw);

    try {
      const existente = await buscarExistente(registro);

      let acao;
      let row;

      if (existente) {
        acao = `atualizar (encontrado por ${existente.metodo})`;
        const divergencias = calcularDivergencias(existente.row, registro);
        if (divergencias.length) registro.dadosMigracao.divergencias_com_cadastro_existente = divergencias;
        if (COMMIT) {
          row = await atualizarComPreservacao(existente.row.id, registro);
        } else {
          row = existente.row;
        }
        resultado.atualizados++;
      } else {
        acao = 'criar';
        if (COMMIT) {
          row = await inserir(registro);
        } else {
          row = { id: '(novo)', status: 'pendente', shopify_customer_id: null, cpf_confirmado: false };
        }
        resultado.criados++;
      }

      let statusFinal = row.status;
      let promocao = null;
      if (COMMIT && registro.prontoParaAtivar) {
        promocao = await tentarPromoverParaAprovado(row, registro);
        if (promocao.promovido) {
          statusFinal = 'aprovado';
          resultado.promovidosAprovado++;
        } else {
          resultado.mantidosPendente++;
        }
      } else if (registro.prontoParaAtivar) {
        // dry-run: não chama Shopify, só projeta o resultado esperado
        statusFinal = '(seria promovido a aprovado no --commit, se Shopify/CPF confirmarem)';
        resultado.promovidosAprovado++;
      } else {
        resultado.mantidosPendente++;
      }

      resultado.linhas.push({
        id_legado: registro.idLegado,
        linha_original: registro.linhaOrigem,
        nome: registro.nome,
        acao,
        status_final: statusFinal,
        id_interno: row.id,
        shopify_customer_id: row.shopify_customer_id || null,
        pronto_para_ativar: registro.prontoParaAtivar,
        motivo_pendente: promocao && !promocao.promovido ? promocao.motivo : undefined,
        observacoes: registro.dadosMigracao.observacoes,
        divergencias_com_cadastro_existente: registro.dadosMigracao.divergencias_com_cadastro_existente,
      });
    } catch (err) {
      const isConflito = err && err.code === '23505';
      const entrada = { id_legado: registro.idLegado, nome: registro.nome, erro: err.message, codigo: err.code };
      if (isConflito) resultado.conflitos.push(entrada);
      else resultado.erros.push(entrada);
    }
  }

  console.log('─'.repeat(60));
  console.log('RESUMO');
  console.log('─'.repeat(60));
  console.log(`Processados:            ${resultado.processados}`);
  console.log(`Criados:                ${resultado.criados}`);
  console.log(`Atualizados:            ${resultado.atualizados}`);
  console.log(`Promovidos a aprovado:  ${resultado.promovidosAprovado}${COMMIT ? '' : ' (projeção — dry-run não chama Shopify)'}`);
  console.log(`Mantidos pendente:      ${resultado.mantidosPendente}`);
  console.log(`Conflitos (23505):      ${resultado.conflitos.length}`);
  console.log(`Erros:                  ${resultado.erros.length}`);

  const relatorioPath = path.join(path.dirname(DATA_FILE), `relatorio-migracao-${COMMIT ? 'commit' : 'dry-run'}-${Date.now()}.json`);
  fs.writeFileSync(relatorioPath, JSON.stringify(resultado, null, 2), 'utf-8');
  console.log(`\nRelatório completo salvo em: ${relatorioPath}`);

  const comDivergencia = resultado.linhas.filter((l) => l.divergencias_com_cadastro_existente && l.divergencias_com_cadastro_existente.length);
  if (comDivergencia.length) {
    console.log(`\nCADASTROS JÁ EXISTENTES COM DADOS DIVERGENTES (${comDivergencia.length}) — revisar manualmente, nada foi sobrescrito:`);
    comDivergencia.forEach((l) => {
      console.log(`  - ${l.id_legado} (${l.nome}), id interno ${l.id_interno}:`);
      l.divergencias_com_cadastro_existente.forEach((d) =>
        console.log(`      ${d.campo}: banco="${d.valor_atual_no_banco}" vs planilha="${d.valor_na_planilha}"`)
      );
    });
  }

  if (resultado.conflitos.length) {
    console.log('\nCONFLITOS:');
    resultado.conflitos.forEach((c) => console.log(`  - ${c.id_legado} (${c.nome}): ${c.erro}`));
  }
  if (resultado.erros.length) {
    console.log('\nERROS:');
    resultado.erros.forEach((e) => console.log(`  - ${e.id_legado} (${e.nome}): ${e.erro}`));
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Falha inesperada na migração:', err);
    process.exit(1);
  });
