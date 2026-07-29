// TEMPORÁRIO — auditoria pós-migração legada. Chama o endpoint interno do
// Worker (que já tem acesso real ao SHOPIFY_SYNC_SERVICE_KEY em runtime,
// diferente do ambiente local). Protegido por AUDIT_TEMP_KEY (env var
// temporária, adicionada manualmente no dashboard da Vercel). Remover esta
// rota e a env var assim que a auditoria terminar.
const WORKER_API_URL = 'https://uvits-portal-prescritores.uvits.workers.dev';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token || token !== process.env.AUDIT_TEMP_KEY) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const serviceKey = process.env.SHOPIFY_SYNC_SERVICE_KEY;
  if (!serviceKey) return res.status(500).json({ error: 'SHOPIFY_SYNC_SERVICE_KEY não configurada' });

  const { shopifyCustomerIds } = req.body || {};
  if (!Array.isArray(shopifyCustomerIds) || shopifyCustomerIds.length === 0) {
    return res.status(400).json({ error: 'shopifyCustomerIds (array) é obrigatório' });
  }

  try {
    const response = await fetch(`${WORKER_API_URL}/internal/shopify/audit-cpf-metafield`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ shopifyCustomerIds }),
    });
    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (err) {
    return res.status(502).json({ error: 'Falha ao chamar o Worker', detail: err.message });
  }
};
