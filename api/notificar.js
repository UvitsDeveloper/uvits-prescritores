// POST /api/notificar — chamado server-to-server pelo Worker
// uvits-portal-prescritores (nunca pelo navegador), autenticado pela mesma
// PRESCRITORES_SERVICE_KEY já usada pela aba "Cadastros" do painel unificado
// (ver api/_auth.js). Dispatcher {evento, dados} → e-mail via Resend — a
// Fase 5 só implementa o evento de reposição do cupom de indicação; a Fase 7
// estende pros outros eventos do programa (aprovação, ativação, suspensão
// etc.), reaproveitando este mesmo mecanismo central.

const { Resend } = require('resend');
const { autenticar } = require('./_auth');

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = process.env.FROM_EMAIL || 'contato@uvits.com.br';
const FROM_NAME  = process.env.FROM_NAME  || 'Uvits Pro Prescritor';
const TO_EMAIL   = process.env.TO_EMAIL   || 'contato@uvits.com.br';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const EVENTOS = {
  cupom_indicacao_reposicao(dados) {
    const codigo = escapeHtml(dados.codigo);
    return {
      subject: `Cupom de indicação ${codigo} reposto automaticamente`,
      html: `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head><meta charset="UTF-8"></head>
        <body style="margin:0;padding:0;background:#F5F1EC;font-family:'Inter',Arial,sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F1EC;padding:40px 0;">
            <tr><td align="center">
              <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E8E3DD;">
                <tr>
                  <td style="background:#1C2620;padding:24px 40px;">
                    <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#2EC4A5;">UVITS PRO PRESCRITOR</p>
                    <h1 style="margin:8px 0 0;font-size:20px;font-weight:900;color:#fff;">Cupom de indicação reposto</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding:32px 40px;">
                    <p style="margin:0 0 16px;font-size:14px;color:#5a6b5e;line-height:1.7;">
                      O cupom <strong style="color:#1C2620;">${codigo}</strong> atingiu menos de 100 usos restantes
                      e foi reposto automaticamente — nenhuma ação necessária.
                    </p>
                    <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F1EC;border-radius:10px;padding:20px;">
                      <tr><td style="padding:6px 0;font-size:13px;color:#5a6b5e;"><strong style="color:#1C2620;">Quantidade anterior:</strong> ${escapeHtml(dados.quantidadeAnterior)}</td></tr>
                      <tr><td style="padding:6px 0;font-size:13px;color:#5a6b5e;"><strong style="color:#1C2620;">Quantidade nova:</strong> ${escapeHtml(dados.quantidadeNova)}</td></tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td></tr>
          </table>
        </body>
        </html>
      `,
    };
  },
};

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
  const construtor = EVENTOS[evento];
  if (!construtor)
    return res.status(400).json({ error: 'Evento desconhecido' });

  const destinatarioBruto = (dados && dados.destinatario) || TO_EMAIL;
  const destinatario = destinatarioBruto.includes(',')
    ? destinatarioBruto.split(',').map((e) => e.trim())
    : destinatarioBruto;

  try {
    const { subject, html } = construtor(dados || {});
    await resend.emails.send({ from: `${FROM_NAME} <${FROM_EMAIL}>`, to: destinatario, subject, html });
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[notificar] falha ao enviar e-mail:', err);
    return res.status(502).json({ error: 'Falha ao enviar e-mail' });
  }
};
