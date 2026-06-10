const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const { nome, email, whatsapp, profissao, conselho } = req.body;

  if (!nome || !email) {
    return res.status(400).json({ error: 'Nome e email são obrigatórios' });
  }

  try {
    // Email de confirmação para o prescritor
    await resend.emails.send({
      from: 'Uvits Pro Prescritor <contato@uvits.com.br>',
      to: email,
      subject: 'Cadastro recebido — Uvits Pro Prescritor',
      html: `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="margin:0;padding:0;background:#F5F1EC;font-family:'Inter',Arial,sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F1EC;padding:40px 0;">
            <tr><td align="center">
              <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E8E3DD;">
                <!-- Header -->
                <tr>
                  <td style="background:#1C2620;padding:32px 40px;text-align:center;">
                    <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#2EC4A5;">UVITS PRO PRESCRITOR</p>
                    <h1 style="margin:10px 0 0;font-size:24px;font-weight:900;color:#fff;letter-spacing:-0.5px;">Cadastro recebido!</h1>
                  </td>
                </tr>
                <!-- Body -->
                <tr>
                  <td style="padding:36px 40px;">
                    <p style="margin:0 0 16px;font-size:15px;color:#1C2620;font-weight:700;">Olá, ${nome}!</p>
                    <p style="margin:0 0 20px;font-size:14px;color:#5a6b5e;line-height:1.7;">
                      Recebemos o seu cadastro no programa <strong>Uvits Pro Prescritor</strong>. 
                      Nossa equipe vai validar suas informações e você receberá uma confirmação em até <strong>24 horas úteis</strong>.
                    </p>
                    <!-- Dados -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F1EC;border-radius:10px;padding:20px;margin-bottom:24px;">
                      <tr><td style="padding:6px 0;font-size:13px;color:#5a6b5e;"><strong style="color:#1C2620;">Nome:</strong> ${nome}</td></tr>
                      <tr><td style="padding:6px 0;font-size:13px;color:#5a6b5e;"><strong style="color:#1C2620;">Email:</strong> ${email}</td></tr>
                      <tr><td style="padding:6px 0;font-size:13px;color:#5a6b5e;"><strong style="color:#1C2620;">WhatsApp:</strong> ${whatsapp || '—'}</td></tr>
                      <tr><td style="padding:6px 0;font-size:13px;color:#5a6b5e;"><strong style="color:#1C2620;">Profissão:</strong> ${profissao || '—'}</td></tr>
                      <tr><td style="padding:6px 0;font-size:13px;color:#5a6b5e;"><strong style="color:#1C2620;">Conselho:</strong> ${conselho || '—'}</td></tr>
                    </table>
                    <p style="margin:0 0 8px;font-size:13px;color:#5a6b5e;line-height:1.7;">
                      Enquanto isso, conheça nosso portfólio completo de vitaminas líquidas:
                    </p>
                    <a href="https://uvits.com.br" style="display:inline-block;background:#2EC4A5;color:#fff;font-size:13px;font-weight:700;padding:12px 24px;border-radius:8px;text-decoration:none;margin-top:8px;">
                      Visitar uvits.com.br →
                    </a>
                  </td>
                </tr>
                <!-- Footer -->
                <tr>
                  <td style="background:#F5F1EC;padding:20px 40px;border-top:1px solid #E8E3DD;text-align:center;">
                    <p style="margin:0;font-size:11px;color:#aab8b2;line-height:1.6;">
                      🔒 Dados protegidos pela LGPD · Nenhuma informação compartilhada com terceiros<br>
                      Uvits Vitaminas · uvits.com.br
                    </p>
                  </td>
                </tr>
              </table>
            </td></tr>
          </table>
        </body>
        </html>
      `
    });

    // Email de aviso para a Uvits
    await resend.emails.send({
      from: 'Uvits Pro Prescritor <contato@uvits.com.br>',
      to: 'contato@uvits.com.br',
      subject: `🆕 Novo prescritor: ${nome}`,
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
                    <h1 style="margin:8px 0 0;font-size:20px;font-weight:900;color:#fff;">Novo cadastro recebido</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding:32px 40px;">
                    <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F1EC;border-radius:10px;padding:20px;">
                      <tr><td style="padding:8px 0;font-size:14px;color:#5a6b5e;border-bottom:1px solid #E8E3DD;"><strong style="color:#1C2620;display:inline-block;width:110px;">Nome</strong> ${nome}</td></tr>
                      <tr><td style="padding:8px 0;font-size:14px;color:#5a6b5e;border-bottom:1px solid #E8E3DD;"><strong style="color:#1C2620;display:inline-block;width:110px;">Email</strong> <a href="mailto:${email}" style="color:#2EC4A5;">${email}</a></td></tr>
                      <tr><td style="padding:8px 0;font-size:14px;color:#5a6b5e;border-bottom:1px solid #E8E3DD;"><strong style="color:#1C2620;display:inline-block;width:110px;">WhatsApp</strong> ${whatsapp || '—'}</td></tr>
                      <tr><td style="padding:8px 0;font-size:14px;color:#5a6b5e;border-bottom:1px solid #E8E3DD;"><strong style="color:#1C2620;display:inline-block;width:110px;">Profissão</strong> ${profissao || '—'}</td></tr>
                      <tr><td style="padding:8px 0;font-size:14px;color:#5a6b5e;"><strong style="color:#1C2620;display:inline-block;width:110px;">Conselho</strong> ${conselho || '—'}</td></tr>
                    </table>
                    <p style="margin:20px 0 0;font-size:12px;color:#aab8b2;">
                      Cadastro recebido em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                    </p>
                  </td>
                </tr>
              </table>
            </td></tr>
          </table>
        </body>
        </html>
      `
    });

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('Erro ao enviar email:', error);
    return res.status(500).json({ error: 'Erro ao processar cadastro' });
  }
};
