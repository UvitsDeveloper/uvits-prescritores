const { sql }      = require('@vercel/postgres');
const { autenticar } = require('./_auth');
const { registrarUso } = require('./_usage');
const { limitarDelete } = require('./_ratelimit');
const { sincronizarComShopify, confirmarCpfNaShopify, ativarPrescritor } = require('./_shopifySync');
const { validarCpf } = require('./_cpf');

module.exports = async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');

  const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  await registrarUso(req, 1); // sem rate limit nesta rota → só 1 comando (incrby)

  // Todas as rotas exigem autenticação
  const usuario = autenticar(req, res);
  if (!usuario) return;

  // ── GET /api/prescritores — listar com filtros e paginação ────────────────
  if (req.method === 'GET') {
    const status    = req.query.status   || '';
    const busca     = req.query.busca    || '';
    const pagina    = Math.max(1, parseInt(req.query.pagina) || 1);
    const porPagina = 20;
    const offset    = (pagina - 1) * porPagina;

    try {
      // Monta query dinâmica segura com parâmetros posicionais
      let conditions = [];
      let params     = [];
      let idx        = 1;

      if (status && status !== 'todos') {
        conditions.push(`status = $${idx++}`);
        params.push(status);
      }

      if (busca.trim()) {
        const termo = `%${busca.trim().slice(0, 100)}%`;
        conditions.push(`(nome ILIKE $${idx} OR email ILIKE $${idx} OR profissao ILIKE $${idx})`);
        params.push(termo);
        idx++;
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

      // Total de registros (para paginação)
      const countQuery = `SELECT COUNT(*) FROM prescritores ${where}`;
      const { rows: countRows } = await sql.query(countQuery, params);
      const total = parseInt(countRows[0].count);

      // Registros da página
      const dataQuery = `
        SELECT id, nome, email, whatsapp, profissao, conselho,
               email_enviado, status, shopify_customer_id, origem, notas, criado_em, atualizado_em
        FROM prescritores
        ${where}
        ORDER BY criado_em DESC
        LIMIT $${idx} OFFSET $${idx + 1}
      `;
      const { rows } = await sql.query(dataQuery, [...params, porPagina, offset]);

      // Contagem por status para os badges do painel
      const { rows: badges } = await sql`
        SELECT status, COUNT(*) as total
        FROM prescritores
        GROUP BY status
      `;

      return res.status(200).json({
        prescritores: rows,
        paginacao: { total, pagina, porPagina, totalPaginas: Math.ceil(total / porPagina) },
        badges: badges.reduce((acc, r) => ({ ...acc, [r.status]: parseInt(r.total) }), {})
      });

    } catch (err) {
      console.error('[prescritores GET] erro:', err);
      return res.status(500).json({ error: 'Erro ao buscar cadastros' });
    }
  }

  // ── PATCH /api/prescritores — atualizar status e notas ───────────────────
  if (req.method === 'PATCH') {
    const id = parseInt(req.query.id);
    if (!id || isNaN(id))
      return res.status(400).json({ error: 'ID inválido' });

    // Modelo de status vigente — ver comentário em scripts/schema.sql.
    const STATUS_VALIDOS = ['pendente', 'pendente_cpf', 'aprovado', 'ativo', 'reprovado', 'suspenso', 'inativo'];
    const { status, notas, cpf, percentualIndicacao, valorMinimoIndicacao } = req.body || {};

    if (status && !STATUS_VALIDOS.includes(status))
      return res.status(400).json({ error: 'Status inválido' });

    try {
      const novoStatus = status || null;
      const novasNotas = notas !== undefined ? String(notas).slice(0, 2000) : null;

      // Uma única leitura do estado atual — usada pelas validações de CPF
      // (Fase 4), aprovação e ativação (Fase 5) abaixo, todas ANTES de tocar
      // o Postgres: se qualquer uma falhar, nada é salvo pela metade.
      const { rows: atualRows } = await sql`SELECT * FROM prescritores WHERE id = ${id}`;
      if (atualRows.length === 0)
        return res.status(404).json({ error: 'Cadastro não encontrado' });
      const atual = atualRows[0];

      // Fase 4 (CPF/metafield): desacoplado do status-alvo — permite "salvar
      // CPF sem aprovar" (admin confere os dados antes de decidir aprovar).
      let cpfConfirmadoNestaRequisicao = false;
      if (cpf !== undefined) {
        if (!atual.shopify_customer_id)
          return res.status(400).json({ error: 'Cadastro precisa estar vinculado a um cliente Shopify (avance para pendente_cpf primeiro).' });
        if (!validarCpf(cpf))
          return res.status(400).json({ error: 'CPF inválido' });

        const confirmacao = await confirmarCpfNaShopify({ shopifyCustomerId: atual.shopify_customer_id, cpf });
        if (!confirmacao.ok) {
          console.error('[prescritores PATCH] falha ao confirmar CPF na Shopify:', confirmacao.error);
          return res.status(502).json({ error: 'Não foi possível confirmar o CPF na Shopify. Tente novamente.' });
        }
        cpfConfirmadoNestaRequisicao = true;
      }

      if (novoStatus === 'aprovado') {
        if (!atual.shopify_customer_id)
          return res.status(400).json({ error: 'Cadastro precisa estar vinculado a um cliente Shopify antes de aprovar (avance para pendente_cpf primeiro).' });
        if (!cpfConfirmadoNestaRequisicao && !atual.cpf_confirmado)
          return res.status(400).json({ error: 'CPF obrigatório para aprovar.' });
      }

      // Fase 5 (cupom de indicação): "ativo" só a partir de "aprovado", e só
      // é persistido quando o Worker confirma sincronização completa nas
      // duas plataformas (Shopify + Yampi) — seção 7 do documento de regras.
      let ativacao;
      if (novoStatus === 'ativo') {
        if (atual.status !== 'aprovado')
          return res.status(400).json({ error: 'Cadastro precisa estar aprovado antes de ativar.' });

        const percent = percentualIndicacao !== undefined ? Number(percentualIndicacao) : 10;
        if (!Number.isFinite(percent) || percent < 1 || percent > 30)
          return res.status(400).json({ error: 'Percentual de indicação deve estar entre 1 e 30.' });

        const minValue = valorMinimoIndicacao !== undefined ? Number(valorMinimoIndicacao) : 0;
        if (percent > 15 && (!Number.isFinite(minValue) || minValue < 79.99))
          return res.status(400).json({ error: 'Percentual acima de 15% exige valor mínimo de compra de pelo menos R$ 79,99.' });

        ativacao = await ativarPrescritor({ shopifyCustomerId: atual.shopify_customer_id, percent, minValue });
        if (!ativacao.ok) {
          console.error('[prescritores PATCH] falha ao chamar ativação:', ativacao.error);
          return res.status(502).json({ error: 'Não foi possível ativar o prescritor. Tente novamente.' });
        }
        if (!ativacao.activated) {
          return res.status(502).json({
            error: 'Ativação ainda não concluída — sincronização parcial. Tente novamente.',
            syncStatus: ativacao.syncStatus,
            coupon: ativacao.coupon,
          });
        }
      }

      // Atualiza apenas os campos enviados
      if (novoStatus && novasNotas !== null) {
        await sql`
          UPDATE prescritores
          SET status = ${novoStatus}, notas = ${novasNotas}, cpf_confirmado = cpf_confirmado OR ${cpfConfirmadoNestaRequisicao}
          WHERE id = ${id}
        `;
      } else if (novoStatus) {
        await sql`
          UPDATE prescritores
          SET status = ${novoStatus}, cpf_confirmado = cpf_confirmado OR ${cpfConfirmadoNestaRequisicao}
          WHERE id = ${id}
        `;
      } else if (novasNotas !== null || cpfConfirmadoNestaRequisicao) {
        await sql`
          UPDATE prescritores
          SET notas = COALESCE(${novasNotas}, notas), cpf_confirmado = cpf_confirmado OR ${cpfConfirmadoNestaRequisicao}
          WHERE id = ${id}
        `;
      }

      const { rows } = await sql`SELECT * FROM prescritores WHERE id = ${id}`;
      let prescritor = rows[0];
      let shopifySync;

      // Fase 3 (pré-cadastro Shopify): ao entrar em pendente_cpf, garante que
      // existe um cliente Shopify vinculado. Best-effort — nunca falha a
      // resposta principal; se der errado, shopify_customer_id continua NULL
      // e a próxima vez que o status for salvo tenta de novo.
      if (prescritor && prescritor.status === 'pendente_cpf' && !prescritor.shopify_customer_id) {
        const sync = await sincronizarComShopify({ email: prescritor.email, nome: prescritor.nome });
        shopifySync = { ok: sync.ok, error: sync.error };

        if (sync.ok) {
          const { rows: atualizado } = await sql`
            UPDATE prescritores SET shopify_customer_id = ${sync.shopifyCustomerId} WHERE id = ${id}
            RETURNING *
          `;
          prescritor = atualizado[0];
        } else {
          console.error('[prescritores PATCH] falha ao sincronizar com Shopify:', sync.error);
        }
      }

      return res.status(200).json({ prescritor, shopifySync, ativacao });

    } catch (err) {
      console.error('[prescritores PATCH] erro:', err);
      return res.status(500).json({ error: 'Erro ao atualizar cadastro' });
    }
  }

  // ── DELETE /api/prescritores?id= — excluir UM cadastro por vez ─────────────
  if (req.method === 'DELETE') {
    // Rate limit: impede exclusões em larga escala (loop de deletes)
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
    if (!(await limitarDelete(ip)))
      return res.status(429).json({ error: 'Muitas exclusões em sequência. Tente novamente em alguns minutos.' });

    const id = parseInt(req.query.id);
    if (!id || isNaN(id))
      return res.status(400).json({ error: 'ID inválido' });

    // Regra de negócio: cadastros que já receberam uma decisão administrativa
    // (aprovado, ativo, reprovado, suspenso, inativo) preservam histórico —
    // exclusão definitiva só é permitida enquanto o cadastro ainda está
    // pendente (nunca foi analisado). Use a inativação pros demais casos.
    const EXCLUSAO_BLOQUEADA = ['aprovado', 'ativo', 'reprovado', 'suspenso', 'inativo'];

    try {
      const { rows: existente } = await sql`SELECT status FROM prescritores WHERE id = ${id}`;
      if (existente.length === 0)
        return res.status(404).json({ error: 'Cadastro não encontrado' });
      if (EXCLUSAO_BLOQUEADA.includes(existente[0].status))
        return res.status(409).json({ error: 'Este cadastro já recebeu uma decisão administrativa e não pode ser excluído — use a inativação para preservar o histórico.' });

      // Exclui estritamente por id único — nunca em massa
      const { rowCount } = await sql`DELETE FROM prescritores WHERE id = ${id}`;
      if (rowCount === 0)
        return res.status(404).json({ error: 'Cadastro não encontrado' });
      return res.status(200).json({ success: true, id });
    } catch (err) {
      console.error('[prescritores DELETE] erro:', err);
      return res.status(500).json({ error: 'Erro ao excluir cadastro' });
    }
  }

  return res.status(405).json({ error: 'Método não permitido' });
};
