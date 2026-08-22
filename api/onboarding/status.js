const { registrarUso } = require('../_usage');
const { limitarOnboardingLeitura } = require('../_ratelimit');
const { consultarConvite } = require('../_onboardingSync');

/** Passo 1-2 do onboarding por convite: confirma que o link ainda vale e
 * devolve só o e-mail mascarado. Nunca autentica o prescritor sozinho (o
 * código por e-mail continua obrigatório depois) — ver Worker,
 * src/prescriberOnboarding/otp.ts. */
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
  if (!(await limitarOnboardingLeitura(ip))) {
    return res.status(429).json({ error: 'Muitas tentativas. Tente novamente em instantes.' });
  }

  const token = String(req.body?.token || '').trim().slice(0, 512);
  if (!token) return res.status(400).json({ error: 'Link inválido.' });

  const resultado = await consultarConvite(token);
  if (!resultado.ok) {
    return res.status(resultado.status || 502).json({ error: resultado.error, code: resultado.code });
  }
  return res.status(200).json({ ok: true, maskedEmail: resultado.data.maskedEmail });
};
