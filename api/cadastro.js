const { Resend } = require('resend');
const { sql }    = require('@vercel/postgres');
const { limitarCadastro } = require('./_ratelimit');
const { registrarUso }    = require('./_usage');

const resend = new Resend(process.env.RESEND_API_KEY);

// Configuráveis via variáveis de ambiente no Vercel
const FROM_EMAIL = process.env.FROM_EMAIL || 'contato@uvits.com.br';
const TO_EMAIL   = process.env.TO_EMAIL   || 'contato@uvits.com.br';
const FROM_NAME  = process.env.FROM_NAME  || 'Uvits Pro Prescritor';

// ── Sanitização: remove tags HTML e limita tamanho ───────────────────────────
function sanitize(value, maxLength = 200) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
    .trim()
    .slice(0, maxLength);
}

// ── Validações ────────────────────────────────────────────────────────────────
const EMAIL_REGEX    = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WHATSAPP_REGEX = /^[\d\s\-()+]{7,20}$/;

const PROFISSOES_VALIDAS = ['Médico(a)', 'Nutricionista'];

function validar(dados) {
  const erros = [];

  if (!dados.nome || dados.nome.length < 3)
    erros.push('Nome deve ter ao menos 3 caracteres.');

  if (!dados.email || !EMAIL_REGEX.test(dados.email))
    erros.push('E-mail inválido.');

  if (!dados.whatsapp || !WHATSAPP_REGEX.test(dados.whatsapp))
    erros.push('WhatsApp é obrigatório e deve ser válido.');

  if (!dados.conselho || dados.conselho.length < 4)
    erros.push('Número do conselho (CRM ou CRN) é obrigatório.');

  if (!dados.profissao || !PROFISSOES_VALIDAS.includes(dados.profissao))
    erros.push('Profissão deve ser Médico(a) ou Nutricionista.');

  return erros;
}

// ── Handler principal ─────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  // Cabeçalhos de segurança
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // CORS restrito ao próprio domínio em produção
  const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  await registrarUso(req); // medidor de uso cross-projeto (não bloqueia)

  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Método não permitido' });

  // Verificação de Content-Type
  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('application/json'))
    return res.status(415).json({ error: 'Content-Type deve ser application/json' });

  // Rate limiting por IP
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  if (!(await limitarCadastro(ip)))
    return res.status(429).json({ error: 'Muitas tentativas. Tente novamente em 1 hora.' });

  // Sanitização de todos os campos
  const nome      = sanitize(req.body?.nome,      120);
  const email     = sanitize(req.body?.email,      254).toLowerCase();
  const whatsapp  = sanitize(req.body?.whatsapp,    30);
  const profissao = sanitize(req.body?.profissao,   60);
  const conselho  = sanitize(req.body?.conselho,    60);

  // Validação
  const erros = validar({ nome, email, whatsapp, profissao, conselho });
  if (erros.length > 0)
    return res.status(400).json({ error: erros.join(' ') });

  // ── 1. Salvar no banco ANTES de enviar e-mails (Atomicidade) ───────────────
  let prescritorId = null;
  let emailEnviado = false;

  try {
    const { rows } = await sql`
      INSERT INTO prescritores (nome, email, whatsapp, profissao, conselho, email_enviado, status)
      VALUES (${nome}, ${email}, ${whatsapp || null}, ${profissao || null}, ${conselho || null}, false, 'aguardando_contato')
      RETURNING id
    `;
    prescritorId = rows[0].id;
  } catch (err) {
    console.error('[cadastro] erro ao salvar no banco:', err);
    return res.status(500).json({ error: 'Erro ao processar cadastro. Tente novamente.' });
  }

  // ── 2. Envio dos e-mails ─────────────────────────────────────────────────────
  // Promise.allSettled: ambos são sempre tentados, independente de falha.
  const timestamp = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  const [r1, r2] = await Promise.allSettled([

    // E-mail 1: confirmação para o prescritor
    resend.emails.send({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
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
                <tr>
                  <td style="background:#1C2620;padding:32px 40px;text-align:center;">
                    <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#2EC4A5;">UVITS PRO PRESCRITOR</p>
                    <h1 style="margin:10px 0 0;font-size:24px;font-weight:900;color:#fff;letter-spacing:-0.5px;">Cadastro recebido!</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding:36px 40px;">
                    <p style="margin:0 0 16px;font-size:15px;color:#1C2620;font-weight:700;">Olá, ${nome}!</p>
                    <p style="margin:0 0 20px;font-size:14px;color:#5a6b5e;line-height:1.7;">
                      Recebemos o seu cadastro no programa <strong>Uvits Pro Prescritor</strong>.
                      Nossa equipe vai validar suas informações e você receberá uma confirmação em até <strong>24 horas úteis</strong>.
                    </p>
                    <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F1EC;border-radius:10px;padding:20px;margin-bottom:24px;">
                      <tr><td style="padding:6px 0;font-size:13px;color:#5a6b5e;"><strong style="color:#1C2620;">Nome:</strong> ${nome}</td></tr>
                      <tr><td style="padding:6px 0;font-size:13px;color:#5a6b5e;"><strong style="color:#1C2620;">Email:</strong> ${email}</td></tr>
                      <tr><td style="padding:6px 0;font-size:13px;color:#5a6b5e;"><strong style="color:#1C2620;">WhatsApp:</strong> ${whatsapp || '—'}</td></tr>
                      <tr><td style="padding:6px 0;font-size:13px;color:#5a6b5e;"><strong style="color:#1C2620;">Profissão:</strong> ${profissao || '—'}</td></tr>
                      <tr><td style="padding:6px 0;font-size:13px;color:#5a6b5e;"><strong style="color:#1C2620;">Conselho:</strong> ${conselho || '—'}</td></tr>
                    </table>
                    <a href="https://uvits.com.br" style="display:inline-block;background:#2EC4A5;color:#fff;font-size:13px;font-weight:700;padding:12px 24px;border-radius:8px;text-decoration:none;margin-top:8px;">
                      Visitar uvits.com.br →
                    </a>
                  </td>
                </tr>
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
    }),

    // E-mail 2: aviso interno para a Uvits
    resend.emails.send({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: TO_EMAIL,
      subject: `Novo prescritor: ${nome}`,
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
                    <p style="margin:20px 0 0;font-size:12px;color:#aab8b2;">Cadastro recebido em ${timestamp}</p>
                  </td>
                </tr>
              </table>
            </td></tr>
          </table>
        </body>
        </html>
      `
    })
  ]);

  // Log de falhas sem expor detalhes ao cliente
  if (r1.status === 'rejected') console.error('[cadastro] email confirmacao falhou:', r1.reason);
  if (r2.status === 'rejected') console.error('[cadastro] email interno falhou:', r2.reason);

  // Se ambos falharam, retorna erro (mas registro já foi salvo no banco)
  if (r1.status === 'rejected' && r2.status === 'rejected')
    return res.status(500).json({ error: 'Erro ao enviar confirmação. Seu cadastro foi recebido.' });

  // ── 3. Atualizar email_enviado no banco ──────────────────────────────────────
  emailEnviado = r1.status === 'fulfilled';
  try {
    await sql`
      UPDATE prescritores
      SET email_enviado = ${emailEnviado}
      WHERE id = ${prescritorId}
    `;
  } catch (err) {
    console.error('[cadastro] erro ao atualizar email_enviado:', err);
    // Não crítico — registro já existe, apenas o flag ficou desatualizado
  }

  return res.status(200).json({ success: true });
};
