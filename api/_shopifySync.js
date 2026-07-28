// Chama os endpoints internos do Worker uvits-portal-prescritores — que é
// quem fala com a Shopify e a Yampi de verdade. Nunca lança — todas as
// funções aqui retornam { ok, ...dados, error? } pra quem chamar decidir o
// que fazer (o PATCH de prescritores.js nunca falha por causa disso quando é
// um efeito colateral best-effort, como a Fase 3).

const WORKER_API_URL = process.env.WORKER_API_URL || 'https://uvits-portal-prescritores.uvits.workers.dev';
const TIMEOUT_MS = 8000;

async function chamarWorker(path, body) {
  const serviceKey = process.env.SHOPIFY_SYNC_SERVICE_KEY;
  if (!serviceKey) {
    return { ok: false, error: 'SHOPIFY_SYNC_SERVICE_KEY não configurada' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${WORKER_API_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const detalhe = data?.detail || data?.error || '';
      return { ok: false, error: `Worker respondeu ${response.status}${detalhe ? ': ' + detalhe : ''}` };
    }

    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: `Falha ao chamar o Worker: ${err.message}` };
  } finally {
    clearTimeout(timeout);
  }
}

// Fase 3 (pré-cadastro Shopify): encontra ou cria o cliente Shopify, aplica
// a tag de "em avaliação".
async function sincronizarComShopify({ email, nome }) {
  const resultado = await chamarWorker('/internal/shopify/prescriber-customer', { email, nome });
  if (!resultado.ok) return resultado;
  if (!resultado.data?.shopifyCustomerId) {
    return { ok: false, error: 'Resposta do Worker sem shopifyCustomerId' };
  }
  return { ok: true, shopifyCustomerId: resultado.data.shopifyCustomerId };
}

// Fase 4 (CPF/metafield): grava o CPF no cliente Shopify já vinculado. Nunca
// loga o valor recebido — nem em sucesso, nem em erro.
async function confirmarCpfNaShopify({ shopifyCustomerId, cpf }) {
  return chamarWorker('/internal/shopify/prescriber-cpf', { shopifyCustomerId, cpf });
}

// Fase 5 (cupom de indicação): troca a tag prescritor_pendente pela
// prescritor e cria o cupom de indicação nas duas plataformas. Só considera
// "ativado" quando syncStatus === 'synced' — falha parcial não é um erro de
// transporte (resultado.ok pode ser true mesmo sem ativar de fato).
async function ativarPrescritor({ shopifyCustomerId, percent, minValue }) {
  const resultado = await chamarWorker('/internal/shopify/activate-prescriber', { shopifyCustomerId, percent, minValue });
  if (!resultado.ok) return resultado;
  return {
    ok: true,
    activated: !!resultado.data?.activated,
    syncStatus: resultado.data?.syncStatus,
    coupon: resultado.data?.coupon,
  };
}

module.exports = { sincronizarComShopify, confirmarCpfNaShopify, ativarPrescritor };
