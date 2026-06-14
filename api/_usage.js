// ── Monitor de uso compartilhado do Upstash Redis + alerta por e-mail ────────
// MESMA convenção da API de Frete (lib/usage-alert.js): todos os projetos que
// apontam para o MESMO Upstash Redis incrementam a chave `cmdusage:YYYY-MM` e
// compartilham o dedup `alerted:YYYY-MM:<tag>`. Assim o alerta de 80%/95%
// reflete o uso COMBINADO de comandos do Upstash entre os projetos.
//
// O contador `cmdusage:YYYY-MM` guarda COMANDOS reais: cada chamador informa
// quantos comandos Redis a requisição emitiu, e fazemos incrby por esse número.
//
// DROP-IN: autossuficiente. Copie em cada projeto e chame registrarUso(req, comandos).
const { Redis } = require('@upstash/redis');

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL   || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const redis = (REDIS_URL && REDIS_TOKEN)
  ? new Redis({ url: REDIS_URL, token: REDIS_TOKEN })
  : null;

const LIMIT        = parseInt(process.env.REDIS_COMMAND_LIMIT || '500000', 10);
// comandos por requisição assumidos quando registrarUso é chamado sem o nº exato
const CMDS_PER_REQ = parseInt(process.env.REDIS_CMDS_PER_REQUEST || '2', 10);
const PROJETO      = process.env.USAGE_PROJECT || 'uvits-prescritores';

// Limiares de alerta (fração do limite mensal) — iguais aos da Frete
const THRESHOLDS = [
  { frac: 0.8,  tag: '80' },
  { frac: 0.95, tag: '95' },
];

const TTL = 60 * 60 * 24 * 45; // ~45 dias

function mesAtual() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Envia o e-mail de aviso via Resend. Retorna true se enviou.
async function enviarEmail({ usados, limite, pct, mes }) {
  const apiKey = process.env.RESEND_API_KEY;
  const to     = process.env.ALERT_EMAIL_TO   || process.env.TO_EMAIL;
  const from   = process.env.ALERT_EMAIL_FROM || process.env.FROM_EMAIL;
  if (!apiKey || !to || !from) {
    console.warn('[uso] alerta não enviado: variáveis de e-mail ausentes');
    return false;
  }

  const corpo = {
    from,
    to: [to],
    subject: `⚠️ Upstash Redis: ${pct}% do limite de comandos usado (${mes})`,
    html: `
      <h2>Alerta de uso do Redis (Upstash) — uso compartilhado</h2>
      <p>O Redis compartilhado dos seus projetos Vercel atingiu <strong>${pct}%</strong> do limite mensal de comandos.</p>
      <ul>
        <li>Comandos estimados usados: <strong>${usados.toLocaleString('pt-BR')}</strong></li>
        <li>Limite mensal: <strong>${limite.toLocaleString('pt-BR')}</strong></li>
        <li>Mês de referência: <strong>${mes}</strong></li>
        <li>Limiar cruzado a partir do projeto: <strong>${PROJETO}</strong></li>
      </ul>
      <p>Ao chegar a 100%, o rate limiter para de funcionar (os apps seguem
      respondendo, mas sem proteção contra abuso). Considere plano pago do
      Upstash ou reduzir o consumo de comandos.</p>
    `,
  };

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      console.error('[uso] falha ao enviar e-mail:', resp.status, txt.slice(0, 200));
      return false;
    }
    console.info(`[uso] alerta de ${pct}% enviado para ${to}`);
    return true;
  } catch (e) {
    console.error('[uso] erro de rede ao enviar e-mail:', e?.message);
    return false;
  }
}

// Soma os comandos REAIS desta requisição ao contador compartilhado e alerta
// ao cruzar limiar. `comandos` = nº de comandos Redis que a requisição emitiu.
// Ignora preflight OPTIONS. Nunca lança — falha silenciosa.
async function registrarUso(req, comandos = CMDS_PER_REQ) {
  if (!redis) return;
  if (req && req.method === 'OPTIONS') return;

  const mes = mesAtual();
  const chaveContador = `cmdusage:${mes}`;

  try {
    // Soma o nº REAL de comandos desta requisição (contador em comandos)
    const total = await redis.incrby(chaveContador, comandos);

    // Primeira escrita do mês (total == incremento) → define a expiração
    if (total === comandos) {
      await redis.expire(chaveContador, TTL);
    }

    // `total` já está em COMANDOS reais — compara direto com o limite
    for (let i = THRESHOLDS.length - 1; i >= 0; i--) {
      const t = THRESHOLDS[i];
      if (total >= LIMIT * t.frac) {
        const chaveFlag = `alerted:${mes}:${t.tag}`;
        // SET NX (atômico): só o primeiro a cruzar — em QUALQUER projeto — envia
        const trava = await redis.set(chaveFlag, '1', { nx: true, ex: TTL });
        if (trava) {
          await enviarEmail({
            usados: total,
            limite: LIMIT,
            pct: Math.round(t.frac * 100),
            mes,
          });
        }
        break; // só o limiar mais alto cruzado importa
      }
    }
  } catch (e) {
    // Nunca derruba a requisição por causa do monitoramento
    console.error('[uso] erro ao registrar uso:', e?.message);
  }
}

module.exports = { registrarUso, enviarEmail, mesAtual, LIMIT, CMDS_PER_REQ, THRESHOLDS };
