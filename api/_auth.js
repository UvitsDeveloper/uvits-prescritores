const jwt = require('jsonwebtoken');
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
 * Verifica o header Authorization. Aceita duas formas, nesta ordem:
 *   1. PRESCRITORES_SERVICE_KEY — chamada server-to-server do Worker
 *      (uvits-portal-prescritores), sem identidade de usuário.
 *   2. JWT — login por e-mail+senha do painel (fluxo original, intacto).
 * Retorna o "principal" autenticado ou responde com 401.
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

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    return { tipo: 'usuario', ...payload };
  } catch (err) {
    res.status(401).json({ error: 'Token inválido ou expirado' });
    return null;
  }
}

module.exports = { autenticar };
