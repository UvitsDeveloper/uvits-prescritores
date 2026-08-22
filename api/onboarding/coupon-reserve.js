const { registrarUso } = require('../_usage');
const { limitarOnboardingEscrita } = require('../_ratelimit');
const { reservarCupom } = require('../_onboardingSync');

/** Reserva o código escolhido como rascunho — nunca cria nada na
 * Shopify/Yampi ainda (isso só na conclusão). Percentual nunca é aceito
 * aqui nem no Worker: é sempre a política fixa do programa. */
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
  if (!(await limitarOnboardingEscrita(ip))) {
    return res.status(429).json({ error: 'Muitas tentativas. Tente novamente em instantes.' });
  }

  const sessionToken = String(req.body?.sessionToken || '').trim().slice(0, 512);
  const code = String(req.body?.code || '').trim().slice(0, 40);
  if (!sessionToken) return res.status(401).json({ error: 'Sessão inválida.' });
  if (!code) return res.status(400).json({ error: 'Informe um código.' });

  const resultado = await reservarCupom(sessionToken, code);
  if (!resultado.ok) {
    return res.status(resultado.status || 502).json({ error: resultado.error, code: resultado.code });
  }
  return res.status(200).json({ ok: true, code: resultado.data.code, percent: resultado.data.percent });
};
