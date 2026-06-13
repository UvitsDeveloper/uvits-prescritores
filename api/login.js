const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { sql } = require('@vercel/postgres');
const { limitarLogin } = require('./_ratelimit');
const { registrarUso } = require('./_usage');

const JWT_SECRET  = process.env.JWT_SECRET;
const JWT_EXPIRES = '8h';

module.exports = async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');

  const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  await registrarUso(req); // medidor de uso cross-projeto (não bloqueia)

  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Método não permitido' });

  if (!JWT_SECRET)
    return res.status(500).json({ error: 'Configuração de servidor incompleta' });

  // Rate limiting por IP — antes de qualquer trabalho pesado (bcrypt/DB)
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  if (!(await limitarLogin(ip)))
    return res.status(429).json({ error: 'Muitas tentativas. Tente novamente em alguns minutos.' });

  const email = String(req.body?.email || '').trim().toLowerCase().slice(0, 254);
  const senha = String(req.body?.senha || '').slice(0, 200);

  if (!email || !senha)
    return res.status(400).json({ error: 'E-mail e senha são obrigatórios' });

  try {
    const { rows } = await sql`
      SELECT id, nome, email, senha_hash
      FROM usuarios
      WHERE email = ${email}
      LIMIT 1
    `;

    const usuario = rows[0];

    // Mesmo que o usuário não exista, roda o bcrypt para evitar timing attack
    const hashFake = '$2a$12$invalido.hash.para.evitar.timing.attack.00000000000000';
    const hashReal = usuario?.senha_hash || hashFake;
    const senhaOk  = await bcrypt.compare(senha, hashReal);

    if (!usuario || !senhaOk) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const token = jwt.sign(
      { id: usuario.id, nome: usuario.nome, email: usuario.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES, algorithm: 'HS256' }
    );

    return res.status(200).json({
      token,
      usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email }
    });

  } catch (err) {
    console.error('[login] erro:', err);
    return res.status(500).json({ error: 'Erro interno. Tente novamente.' });
  }
};
