// ── Rate limiting compartilhado ──────────────────────────────────────────────
// Estratégia: usa Upstash Redis (durável, compartilhado entre instâncias) quando
// as variáveis de ambiente estiverem configuradas. Caso contrário, faz fallback
// para um limitador em memória (por instância) — suficiente para dev local, mas
// não confiável em serverless sob carga. Configure o Redis em produção.
const { Ratelimit } = require('@upstash/ratelimit');
const { Redis }     = require('@upstash/redis');

// A integração Upstash do Vercel Marketplace injeta UPSTASH_REDIS_REST_*.
// Mantemos fallback para os nomes KV_REST_API_* (integração KV legada).
const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL   || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

const redis = (REDIS_URL && REDIS_TOKEN)
  ? new Redis({ url: REDIS_URL, token: REDIS_TOKEN })
  : null;

// ── Fallback em memória (por instância) ───────────────────────────────────────
const memStore = new Map();
function memLimit(key, max, windowMs) {
  const now = Date.now();
  const entry = memStore.get(key);
  if (!entry || now - entry.start > windowMs) {
    memStore.set(key, { count: 1, start: now });
    return true;
  }
  if (entry.count >= max) return false;
  entry.count++;
  return true;
}

/**
 * Cria uma função limitadora.
 * @param {string} prefix    namespace da chave no Redis
 * @param {number} max       máximo de requisições na janela
 * @param {string} windowStr janela no formato Upstash (ex.: '15 m', '1 h')
 * @param {number} windowMs  mesma janela em ms (para o fallback em memória)
 * @returns {(ip: string) => Promise<boolean>} true = permitido, false = bloquear (429)
 */
function criarLimiter(prefix, max, windowStr, windowMs) {
  const limiter = redis
    ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(max, windowStr), prefix })
    : null;

  return async function (ip) {
    if (limiter) {
      try {
        const { success } = await limiter.limit(ip);
        return success;
      } catch (err) {
        // Falha no Redis não deve derrubar o endpoint — cai no fallback local
        console.error('[ratelimit] erro no Redis, usando fallback em memória:', err);
        return memLimit(`${prefix}:${ip}`, max, windowMs);
      }
    }
    return memLimit(`${prefix}:${ip}`, max, windowMs);
  };
}

const limitarLogin    = criarLimiter('rl:login',    10, '15 m', 15 * 60 * 1000);
const limitarCadastro = criarLimiter('rl:cadastro',  5, '1 h',  60 * 60 * 1000);

module.exports = { limitarLogin, limitarCadastro, usandoRedis: !!redis };
