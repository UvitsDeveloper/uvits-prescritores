// ⚠️ TEMPORÁRIO — usado uma única vez pra completar a etapa de Shopify da
// migração da planilha legada (ver scripts/migrar-planilha-legada.js) e
// removido logo em seguida. Roda server-side na Vercel, onde
// SHOPIFY_SYNC_SERVICE_KEY está disponível de verdade (a var é "Sensitive"
// na Vercel — não pode ser lida localmente, nem por quem a configurou,
// nem via `vercel env pull`). Autenticado por MIGRATION_TEMP_KEY, uma env
// var nova de uso único (adicionada manualmente pelo painel da Vercel,
// nunca por CLI/commit) — nunca reaproveita PRESCRITORES_SERVICE_KEY.
//
// Só atua em linhas que já existem, já estão em "pendente" e já têm
// dados_migracao.status_importacao_planilha === 'PRONTO PARA ATIVAR' —
// nunca cria linha nova, nunca mexe em quem já não está "pendente".

const { sql } = require('@vercel/postgres');
const { validarCpf } = require('./_cpf');
const { sincronizarComShopify, confirmarCpfNaShopify } = require('./_shopifySync');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!process.env.MIGRATION_TEMP_KEY || token !== process.env.MIGRATION_TEMP_KEY) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const { registros } = req.body || {};
  if (!Array.isArray(registros)) return res.status(400).json({ error: 'registros[] obrigatório, cada item { idLegado, cpf }' });

  const resultados = [];

  for (const { idLegado, cpf } of registros) {
    try {
      const { rows } = await sql`SELECT * FROM prescritores WHERE id_legado = ${idLegado} LIMIT 1`;
      if (!rows.length) {
        resultados.push({ idLegado, ok: false, motivo: 'não encontrado por id_legado' });
        continue;
      }
      const row = rows[0];

      if (row.status !== 'pendente') {
        resultados.push({ idLegado, ok: false, motivo: `status atual é "${row.status}", não mexido` });
        continue;
      }
      if (row.dados_migracao?.status_importacao_planilha !== 'PRONTO PARA ATIVAR') {
        resultados.push({ idLegado, ok: false, motivo: 'não marcado como PRONTO PARA ATIVAR na planilha' });
        continue;
      }
      if (!row.email) {
        resultados.push({ idLegado, ok: false, motivo: 'sem e-mail' });
        continue;
      }
      if (!validarCpf(cpf)) {
        resultados.push({ idLegado, ok: false, motivo: 'CPF inválido' });
        continue;
      }

      let shopifyCustomerId = row.shopify_customer_id;
      if (!shopifyCustomerId) {
        const sincronizacao = await sincronizarComShopify({ email: row.email, nome: row.nome });
        if (!sincronizacao.ok) {
          resultados.push({ idLegado, ok: false, motivo: `falha ao criar/vincular cliente Shopify: ${sincronizacao.error}` });
          continue;
        }
        shopifyCustomerId = sincronizacao.shopifyCustomerId;
        await sql`UPDATE prescritores SET shopify_customer_id = ${shopifyCustomerId} WHERE id = ${row.id}`;
      }

      let cpfConfirmado = row.cpf_confirmado;
      if (!cpfConfirmado) {
        const confirmacao = await confirmarCpfNaShopify({ shopifyCustomerId, cpf });
        if (!confirmacao.ok) {
          resultados.push({ idLegado, ok: false, motivo: `falha ao confirmar CPF na Shopify: ${confirmacao.error || confirmacao.mensagem}` });
          continue;
        }
        cpfConfirmado = true;
      }

      await sql`UPDATE prescritores SET status = 'aprovado', cpf_confirmado = ${cpfConfirmado} WHERE id = ${row.id}`;
      resultados.push({ idLegado, ok: true, shopifyCustomerId });
    } catch (err) {
      resultados.push({ idLegado, ok: false, motivo: err.message });
    }
  }

  return res.status(200).json({ resultados });
};
