const { registrarUso } = require('../_usage');
const { limitarOnboardingLeitura } = require('../_ratelimit');
const { consultarConvite } = require('../_onboardingSync');

/** Passo 1-2 do onboarding: confirma que o link ainda vale. O Worker resolve
 * sozinho, no servidor, se é um link de acesso direto por e-mail (accessType
 * "email_direct_access" — devolve sessionToken/profile prontos, sem exigir
 * código) ou um convite externo/WhatsApp (accessType "external_invite_access"
 * — continua exigindo o código por e-mail depois). Este bridge só repassa o
 * que o Worker decidiu; nunca decide nada sozinho — ver
 * src/prescriberOnboarding/otp.ts (resolveOnboardingAccess). */
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
  return res.status(200).json({
    ok: true,
    accessType: resultado.data.accessType,
    maskedEmail: resultado.data.maskedEmail,
    sessionToken: resultado.data.sessionToken,
    expiresAt: resultado.data.expiresAt,
    profile: resultado.data.profile,
  });
};
