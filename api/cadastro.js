const { sql }    = require('@vercel/postgres');
const { limitarCadastro } = require('./_ratelimit');
const { registrarUso }    = require('./_usage');
const { enviarNotificacao } = require('./_notificacoes');

// ── Sanitização: remove tags HTML e limita tamanho ───────────────────────────
function sanitize(value, maxLength = 200) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
    .trim()
    .slice(0, maxLength);
}

// ── Validações ────────────────────────────────────────────────────────────────
const EMAIL_REGEX    = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WHATSAPP_REGEX = /^[\d\s\-()+]{7,20}$/;

const PROFISSOES_VALIDAS = ['Médico(a)', 'Nutricionista'];

function validar(dados) {
  const erros = [];

  if (!dados.nome || dados.nome.length < 3)
    erros.push('Nome deve ter ao menos 3 caracteres.');

  if (!dados.email || !EMAIL_REGEX.test(dados.email))
    erros.push('E-mail inválido.');

  if (!dados.whatsapp || !WHATSAPP_REGEX.test(dados.whatsapp))
    erros.push('WhatsApp é obrigatório e deve ser válido.');

  if (!dados.conselho || dados.conselho.length < 4)
    erros.push('Número do conselho (CRM ou CRN) é obrigatório.');

  if (!dados.profissao || !PROFISSOES_VALIDAS.includes(dados.profissao))
    erros.push('Profissão deve ser Médico(a) ou Nutricionista.');

  return erros;
}

// ── Handler principal ─────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  // Cabeçalhos de segurança
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // CORS restrito ao próprio domínio em produção
  const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  await registrarUso(req); // medidor de uso cross-projeto (não bloqueia)

  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Método não permitido' });

  // Verificação de Content-Type
  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('application/json'))
    return res.status(415).json({ error: 'Content-Type deve ser application/json' });

  // Rate limiting por IP
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  if (!(await limitarCadastro(ip)))
    return res.status(429).json({ error: 'Muitas tentativas. Tente novamente em 1 hora.' });

  // Sanitização de todos os campos
  const nome      = sanitize(req.body?.nome,      120);
  const email     = sanitize(req.body?.email,      254).toLowerCase();
  const whatsapp  = sanitize(req.body?.whatsapp,    30);
  const profissao = sanitize(req.body?.profissao,   60);
  // conselho normalizado em MAIÚSCULAS para uma comparação de unicidade consistente
  const conselho  = sanitize(req.body?.conselho,    60).toUpperCase();

  // Validação
  const erros = validar({ nome, email, whatsapp, profissao, conselho });
  if (erros.length > 0)
    return res.status(400).json({ error: erros.join(' ') });

  // ── Unicidade: e-mail e conselho não podem repetir ─────────────────────────
  try {
    const { rows: dup } = await sql`
      SELECT email, conselho FROM prescritores
      WHERE email = ${email} OR conselho = ${conselho}
      LIMIT 1
    `;
    if (dup.length > 0) {
      const campo = dup[0].email === email ? 'e-mail' : 'registro do conselho (CRM/CRN)';
      return res.status(409).json({ error: `Este ${campo} já está cadastrado.` });
    }
  } catch (err) {
    console.error('[cadastro] erro ao verificar duplicidade:', err);
    return res.status(500).json({ error: 'Erro ao processar cadastro. Tente novamente.' });
  }

  // ── 1. Salvar no banco ANTES de enviar e-mails (Atomicidade) ───────────────
  let prescritorId = null;
  let emailEnviado = false;

  try {
    const { rows } = await sql`
      INSERT INTO prescritores (nome, email, whatsapp, profissao, conselho, email_enviado, status, origem)
      VALUES (${nome}, ${email}, ${whatsapp || null}, ${profissao || null}, ${conselho || null}, false, 'pendente', 'formulario')
      RETURNING id
    `;
    prescritorId = rows[0].id;
  } catch (err) {
    // 23505 = unique_violation — corrida entre a checagem acima e o INSERT
    if (err && err.code === '23505') {
      const campo = String(err.detail || '').includes('email') ? 'e-mail' : 'registro do conselho (CRM/CRN)';
      return res.status(409).json({ error: `Este ${campo} já está cadastrado.` });
    }
    console.error('[cadastro] erro ao salvar no banco:', err);
    return res.status(500).json({ error: 'Erro ao processar cadastro. Tente novamente.' });
  }

  // ── 2. Envio dos e-mails (mecanismo central — Fase 7) ────────────────────────
  // enviarNotificacao nunca lança; ambos os e-mails (prescritor + interno)
  // são sempre tentados via Promise.allSettled internamente.
  const notificacao = await enviarNotificacao('cadastro_recebido', { nome, email, whatsapp, profissao, conselho });
  const [emailPrescritorOk, emailInternoOk] = notificacao.resultados;

  // Se ambos falharam, retorna erro (mas registro já foi salvo no banco)
  if (!emailPrescritorOk && !emailInternoOk)
    return res.status(500).json({ error: 'Erro ao enviar confirmação. Seu cadastro foi recebido.' });

  // ── 3. Atualizar email_enviado no banco ──────────────────────────────────────
  emailEnviado = emailPrescritorOk;
  try {
    await sql`
      UPDATE prescritores
      SET email_enviado = ${emailEnviado}
      WHERE id = ${prescritorId}
    `;
  } catch (err) {
    console.error('[cadastro] erro ao atualizar email_enviado:', err);
    // Não crítico — registro já existe, apenas o flag ficou desatualizado
  }

  return res.status(200).json({ success: true });
};
