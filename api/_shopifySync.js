// Chama o endpoint interno do Worker uvits-portal-prescritores pra garantir
// que existe um cliente Shopify vinculado a um cadastro (Fase 3, pré-cadastro
// Shopify). Nunca lança — retorna { ok, shopifyCustomerId? , error? } pra
// quem chamar decidir o que fazer (o PATCH de prescritores.js nunca falha
// por causa disso, é um efeito colateral best-effort).

const WORKER_API_URL = process.env.WORKER_API_URL || 'https://uvits-portal-prescritores.uvits.workers.dev';
const TIMEOUT_MS = 8000;

async function sincronizarComShopify({ email, nome }) {
  const serviceKey = process.env.SHOPIFY_SYNC_SERVICE_KEY;
  if (!serviceKey) {
    return { ok: false, error: 'SHOPIFY_SYNC_SERVICE_KEY não configurada' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${WORKER_API_URL}/internal/shopify/prescriber-customer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ email, nome }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      return { ok: false, error: `Worker respondeu ${response.status}: ${body.slice(0, 300)}` };
    }

    const data = await response.json();
    if (!data.shopifyCustomerId) {
      return { ok: false, error: 'Resposta do Worker sem shopifyCustomerId' };
    }

    return { ok: true, shopifyCustomerId: data.shopifyCustomerId };
  } catch (err) {
    return { ok: false, error: `Falha ao chamar o Worker: ${err.message}` };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { sincronizarComShopify };
