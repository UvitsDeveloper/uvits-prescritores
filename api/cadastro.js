const { limitarCadastro } = require('./_ratelimit');
const { registrarUso } = require('./_usage');
const { enviarNotificacao } = require('./_notificacoes');
const { criarOuVincularPrescritor } = require('./_shopifySync');

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

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WHATSAPP_REGEX = /^[\d\s\-()+]{7,20}$/;
const PROFISSOES_VALIDAS = ['Médico(a)', 'Nutricionista'];

function validar(dados) {
  const erros = [];
  if (!dados.nome || dados.nome.length < 3) erros.push('Nome deve ter ao menos 3 caracteres.');
  if (!dados.email || !EMAIL_REGEX.test(dados.email)) erros.push('E-mail inválido.');
  if (!dados.whatsapp || !WHATSAPP_REGEX.test(dados.whatsapp)) erros.push('WhatsApp é obrigatório e deve ser válido.');
  if (!dados.conselho || dados.conselho.length < 4) erros.push('Número do conselho (CRM ou CRN) é obrigatório.');
  if (!dados.profissao || !PROFISSOES_VALIDAS.includes(dados.profissao)) erros.push('Profissão deve ser Médico(a) ou Nutricionista.');
  return erros;
}

/** Cadastro público. Nenhum perfil é salvo na Vercel/Postgres: a Shopify é a
 * fonte de verdade e o Worker cuida de criar ou vincular o cliente. */
module.exports = async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  await registrarUso(req);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  if (!(req.headers['content-type'] || '').includes('application/json')) {
    return res.status(415).json({ error: 'Content-Type deve ser application/json' });
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  if (!(await limitarCadastro(ip))) return res.status(429).json({ error: 'Muitas tentativas. Tente novamente em 1 hora.' });

  const nome = sanitize(req.body?.nome, 120);
  const email = sanitize(req.body?.email, 254).toLowerCase();
  const whatsapp = sanitize(req.body?.whatsapp, 30);
  const whatsappConsent = req.body?.whatsappConsent === true;
  const profissao = sanitize(req.body?.profissao, 60);
  const conselho = sanitize(req.body?.conselho, 60).toUpperCase();
  const erros = validar({ nome, email, whatsapp, profissao, conselho });
  if (erros.length) return res.status(400).json({ error: erros.join(' ') });

  const sincronizacao = await criarOuVincularPrescritor({
    nome, email, whatsapp, whatsappConsent, profissao, conselho, origem: 'formulario', status: 'pendente',
  });
  if (!sincronizacao.ok) {
    console.error('[cadastro] falha ao criar/vincular prescritor na Shopify:', sincronizacao.error);
    return res.status(sincronizacao.status === 400 ? 400 : 502).json({
      error: 'Não foi possível concluir seu cadastro agora. Tente novamente em instantes.',
    });
  }

  const notificacao = await enviarNotificacao('cadastro_recebido', { nome, email, whatsapp, profissao, conselho });
  const [emailPrescritorOk, emailInternoOk] = notificacao.resultados;
  if (!emailPrescritorOk && !emailInternoOk) {
    return res.status(500).json({ error: 'Erro ao enviar confirmação. Seu cadastro foi recebido.' });
  }

  return res.status(200).json({ success: true, shopifyCustomerId: sincronizacao.shopifyCustomerId });
};
