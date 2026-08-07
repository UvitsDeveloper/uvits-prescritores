// POST /api/notificar — chamado server-to-server pelo Worker
// uvits-portal-prescritores (nunca pelo navegador), autenticado pela mesma
// PRESCRITORES_SERVICE_KEY já usada pela aba "Cadastros" do painel unificado
// (ver api/_auth.js). O Worker usa este endpoint para notificações da outbox,
// incluindo ativação, reativação, alteração de cupom e alertas operacionais.
// Eventos originados neste próprio projeto continuam chamando
// api/_notificacoes.js diretamente, sem uma requisição HTTP adicional.

const { autenticar } = require('./_auth');
const { enviarNotificacao } = require('./_notificacoes');

module.exports = async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Método não permitido' });

  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('application/json'))
    return res.status(415).json({ error: 'Content-Type deve ser application/json' });

  const usuario = autenticar(req, res);
  if (!usuario) return;

  const { evento, dados } = req.body || {};
  const resultado = await enviarNotificacao(evento, dados);

  if (!resultado.ok) {
    if (resultado.error === 'Evento desconhecido') {
      return res.status(400).json({ error: resultado.error });
    }
    console.error('[notificar] falha ao enviar e-mail:', resultado);
    return res.status(502).json({ error: 'Falha ao enviar e-mail' });
  }

  return res.status(200).json({ success: true });
};
