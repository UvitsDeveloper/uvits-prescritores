const jwt = require('jsonwebtoken');

/**
 * Verifica o token JWT no header Authorization.
 * Retorna o payload decodificado ou responde com 401.
 */
function autenticar(req, res) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: 'Token não fornecido' });
    return null;
  }

  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    res.status(401).json({ error: 'Token inválido ou expirado' });
    return null;
  }
}

module.exports = { autenticar };
