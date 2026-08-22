const { registrarUso } = require('../_usage');
const { limitarOnboardingEscrita } = require('../_ratelimit');
const { enviarFormulario } = require('../_onboardingSync');

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

/** Passo 7-8: formulário de complementação. Só encaminha campos
 * explicitamente conhecidos pro Worker (proteção contra mass assignment) —
 * a validação de verdade (formato, obrigatoriedade) é sempre do Worker;
 * aqui é só sanitização de tamanho/HTML antes de repassar. E-mail nunca é
 * um campo aceito aqui — é sempre o já cadastrado, resolvido pelo Worker a
 * partir da sessão. */
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

  const b = req.body || {};
  const sessionToken = String(b.sessionToken || '').trim().slice(0, 512);
  if (!sessionToken) return res.status(401).json({ error: 'Sessão inválida.' });

  const payload = {
    sessionToken,
    nome: sanitize(b.nome, 120),
    whatsapp: sanitize(b.whatsapp, 30),
    whatsappConsent: b.whatsappConsent === true,
    profissao: sanitize(b.profissao, 60),
    conselho: sanitize(b.conselho, 60).toUpperCase(),
    dataNascimento: sanitize(b.dataNascimento, 10),
    enderecoCep: sanitize(b.enderecoCep, 10),
    enderecoRua: sanitize(b.enderecoRua, 200),
    enderecoNumero: sanitize(b.enderecoNumero, 20),
    enderecoComplemento: b.enderecoComplemento ? sanitize(b.enderecoComplemento, 100) : null,
    enderecoBairro: sanitize(b.enderecoBairro, 100),
    enderecoCidade: sanitize(b.enderecoCidade, 100),
    enderecoUf: sanitize(b.enderecoUf, 2).toUpperCase(),
    instagram: b.instagram ? sanitize(b.instagram, 60) : null,
  };

  const resultado = await enviarFormulario(payload);
  if (!resultado.ok) {
    return res.status(resultado.status || 502).json({ error: resultado.error, code: resultado.code });
  }
  return res.status(200).json({ ok: true });
};
