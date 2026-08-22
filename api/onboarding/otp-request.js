const { registrarUso } = require('../_usage');
const { limitarOnboardingOtp } = require('../_ratelimit');
const { solicitarCodigo } = require('../_onboardingSync');

/** Passo 3-4: gera e envia (pela fila do Worker) um novo código, invalidando
 * qualquer código anterior deste convite. Nunca revela se um e-mail existe
 * — o Worker já responde com a mesma mensagem genérica pra qualquer token
 * inválido. */
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
  if (!(await limitarOnboardingOtp(ip))) {
    return res.status(429).json({ error: 'Muitas tentativas. Tente novamente em instantes.' });
  }

  const token = String(req.body?.token || '').trim().slice(0, 512);
  if (!token) return res.status(400).json({ error: 'Link inválido.' });

  const resultado = await solicitarCodigo(token, ip);
  if (!resultado.ok) {
    return res.status(resultado.status || 502).json({ error: resultado.error, code: resultado.code, retryAfterSeconds: resultado.retryAfterSeconds });
  }
  return res.status(200).json({
    ok: true,
    maskedEmail: resultado.data.maskedEmail,
    expiresAt: resultado.data.expiresAt,
    resendsRemaining: resultado.data.resendsRemaining,
  });
};
