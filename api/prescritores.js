const { sql }      = require('@vercel/postgres');
const { autenticar } = require('./_auth');

module.exports = async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');

  const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

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
               email_enviado, status, notas, criado_em, atualizado_em
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

    const STATUS_VALIDOS = ['aguardando_contato', 'contato_realizado', 'aprovado', 'reprovado'];
    const { status, notas } = req.body || {};

    if (status && !STATUS_VALIDOS.includes(status))
      return res.status(400).json({ error: 'Status inválido' });

    try {
      const novoStatus = status || null;
      const novasNotas = notas !== undefined ? String(notas).slice(0, 2000) : null;

      // Atualiza apenas os campos enviados
      if (novoStatus && novasNotas !== null) {
        await sql`
          UPDATE prescritores
          SET status = ${novoStatus}, notas = ${novasNotas}
          WHERE id = ${id}
        `;
      } else if (novoStatus) {
        await sql`UPDATE prescritores SET status = ${novoStatus} WHERE id = ${id}`;
      } else if (novasNotas !== null) {
        await sql`UPDATE prescritores SET notas = ${novasNotas} WHERE id = ${id}`;
      }

      const { rows } = await sql`SELECT * FROM prescritores WHERE id = ${id}`;
      return res.status(200).json({ prescritor: rows[0] });

    } catch (err) {
      console.error('[prescritores PATCH] erro:', err);
      return res.status(500).json({ error: 'Erro ao atualizar cadastro' });
    }
  }

  return res.status(405).json({ error: 'Método não permitido' });
};
