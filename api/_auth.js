const { timingSafeEqual } = require('crypto');

/**
 * Compara dois valores em tempo constante. Normaliza o tamanho antes de
 * comparar (timingSafeEqual exige buffers do mesmo tamanho) sem vazar
 * informação sobre o tamanho real do segredo configurado.
 */
function compararSeguro(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    // Ainda roda uma comparação de tamanho fixo pra não vazar timing pelo length check.
    timingSafeEqual(Buffer.alloc(32), Buffer.alloc(32));
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/**
 * Verifica o header Authorization. Única identidade administrativa hoje:
 * o painel embedded (uvits-portal-prescritores) chamando via
 * PRESCRITORES_SERVICE_KEY — não há mais login direto nesta aplicação
 * (o antigo painel/login por e-mail+senha foi removido; a conta única
 * de acesso ao sistema é a do app embedded na Shopify).
 */
function autenticar(req, res) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: 'Token não fornecido' });
    return null;
  }

  const serviceKey = process.env.PRESCRITORES_SERVICE_KEY;
  if (serviceKey && compararSeguro(token, serviceKey)) {
    return { tipo: 'service', origem: 'uvits-portal-prescritores' };
  }

  res.status(401).json({ error: 'Token inválido ou expirado' });
  return null;
}

module.exports = { autenticar };
