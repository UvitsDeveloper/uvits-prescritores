// Chama os endpoints /internal/onboarding/* do Worker uvits-portal-prescritores
// — é lá que mora toda a lógica de convite, código por e-mail, formulário de
// complementação, cupom e ativação (Prompts 04-09 do plano de onboarding).
// Este módulo é só uma ponte fina: nunca decide nada de negócio, só encaminha
// com o segredo compartilhado e devolve o resultado estruturado do Worker
// (inclusive o `code` de erro, pra esta app poder reagir sem adivinhar).
//
// Mesmo padrão de _shopifySync.js: nunca lança, sempre devolve
// { ok, data|error, status?, code? }.

const WORKER_API_URL = process.env.WORKER_API_URL || 'https://uvits-portal-prescritores.uvits.workers.dev';
const TIMEOUT_MS = 8000;

async function chamarWorkerOnboarding(path, body, ip) {
  const serviceKey = process.env.SHOPIFY_SYNC_SERVICE_KEY;
  if (!serviceKey) {
    return { ok: false, error: 'SHOPIFY_SYNC_SERVICE_KEY não configurada' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceKey}`,
    };
    // Repassa o IP do visitante pro Worker aplicar sua própria camada de
    // rate limit por IP (ver docs/operations/onboarding-observability.md no
    // repo do Worker) — sem isso, essa camada simplesmente fica inativa lá
    // (o limite por convite/sessão continua valendo de qualquer forma).
    if (ip) headers['X-Forwarded-For'] = ip;

    const response = await fetch(`${WORKER_API_URL}/internal/onboarding${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        code: data?.code,
        error: data?.error || `Worker respondeu ${response.status}`,
        retryAfterSeconds: data?.retryAfterSeconds,
        attemptsRemaining: data?.attemptsRemaining,
      };
    }

    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: `Falha ao chamar o Worker: ${err.message}` };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  consultarConvite: (token) => chamarWorkerOnboarding('/invite/status', { token }),
  solicitarCodigo: (token, ip) => chamarWorkerOnboarding('/otp/request', { token }, ip),
  verificarCodigo: (token, code, ip) => chamarWorkerOnboarding('/otp/verify', { token, code }, ip),
  enviarFormulario: (payload) => chamarWorkerOnboarding('/profile', payload),
  consultarCupom: (sessionToken, code) => chamarWorkerOnboarding('/coupon/availability', { sessionToken, code }),
  sugerirCupons: (sessionToken) => chamarWorkerOnboarding('/coupon/suggestions', { sessionToken }),
  reservarCupom: (sessionToken, code) => chamarWorkerOnboarding('/coupon/reserve', { sessionToken, code }),
  concluirOnboarding: (sessionToken) => chamarWorkerOnboarding('/complete', { sessionToken }),
};
