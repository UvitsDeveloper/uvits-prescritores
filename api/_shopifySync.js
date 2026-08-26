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
    console.error('[shopifySync] SHOPIFY_SYNC_SERVICE_KEY não configurada');
    return { ok: false, error: 'Não foi possível concluir agora. Tente novamente.' };
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
      // data?.detail pode conter o texto técnico bruto de um erro da
      // Shopify (o Worker só o inclui pra staff, não pra prescritor) — loga
      // aqui, nunca repassa pro navegador. `mensagem`/`error` continuam
      // sendo o texto já pensado pra usuário final que o Worker devolveu.
      if (data?.detail) console.error('[shopifySync] detalhe técnico do Worker:', data.detail);
      return { ok: false, status: response.status, mensagem: data?.error, error: data?.error || 'Não foi possível concluir agora. Tente novamente.' };
    }

    return { ok: true, data };
  } catch (err) {
    console.error('[shopifySync] falha ao chamar o Worker:', err.message);
    return { ok: false, error: 'Não foi possível concluir agora. Tente novamente.' };
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

// Cadastro completo: a Shopify é a fonte de verdade do perfil. Esta função
// só encaminha o formulário ao Worker autenticado, sem persistir dados aqui.
async function criarOuVincularPrescritor(dados) {
  const resultado = await chamarWorker('/internal/shopify/prescriber-registration', dados);
  if (!resultado.ok) return resultado;
  if (!resultado.data?.shopifyCustomerId) {
    return { ok: false, error: 'Resposta do Worker sem shopifyCustomerId' };
  }
  return {
    ok: true,
    shopifyCustomerId: resultado.data.shopifyCustomerId,
    created: !!resultado.data.created,
  };
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
async function ativarPrescritor({ shopifyCustomerId, code, percent, minValue }) {
  const resultado = await chamarWorker('/internal/shopify/activate-prescriber', { shopifyCustomerId, code, percent, minValue });
  if (!resultado.ok) return resultado;
  return {
    ok: true,
    activated: !!resultado.data?.activated,
    syncStatus: resultado.data?.syncStatus,
    coupon: resultado.data?.coupon,
  };
}

// Fase 6 (suspensão/inativação): remove a tag e desativa o cupom de
// indicação nas duas plataformas. Idempotente do lado do Worker — se não
// havia cupom, é um no-op.
async function desativarPrescritor({ shopifyCustomerId }) {
  return chamarWorker('/internal/shopify/deactivate-prescriber', { shopifyCustomerId });
}

// Fase 6 (reativação): reaplica a tag e reativa o MESMO cupom de indicação
// (nunca cria um novo) — bloqueia se não houver cupom anterior completo.
async function reativarPrescritor({ shopifyCustomerId }) {
  const resultado = await chamarWorker('/internal/shopify/reactivate-prescriber', { shopifyCustomerId });
  if (!resultado.ok) return resultado;
  return { ok: true, activated: true, coupon: resultado.data?.coupon };
}

module.exports = { criarOuVincularPrescritor, sincronizarComShopify, confirmarCpfNaShopify, ativarPrescritor, desativarPrescritor, reativarPrescritor };
