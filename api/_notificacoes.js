// Mecanismo central de notificação por e-mail (Fase 7) — substitui as
// chamadas ao Resend que antes ficavam espalhadas (cadastro.js tinha as
// suas próprias, notificar.js tinha as dele). Cada evento do programa de
// prescritores tem um "builder" aqui, e enviarNotificacao() cuida do envio
// de verdade — sempre best-effort (nunca lança), quem chama decide o que
// fazer com o resultado.

const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = process.env.FROM_EMAIL || 'contato@uvits.com.br';
const FROM_NAME  = process.env.FROM_NAME  || 'Uvits Pro Prescritor';
const TO_EMAIL   = process.env.TO_EMAIL   || 'contato@uvits.com.br';
const SUPPORT_WHATSAPP_PHONE = '5519998566115';
const SUPPORT_WHATSAPP_URL = `https://api.whatsapp.com/send/?phone=${SUPPORT_WHATSAPP_PHONE}&text=Sou+prescritor+e+preciso+de+ajuda&type=phone_number&app_absent=0`;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Layout compartilhado pelos e-mails transacionais do programa — mesma
// linguagem visual do e-mail de cadastro
// recebido (cabeçalho verde-escuro, destaque teal, fundo creme), mas como
// função reaproveitável já que esse conteúdo é novo (sem comportamento
// existente a preservar byte a byte).
function layoutPrescritor({ headerTitle, bodyHtml }) {
  return `
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
                <h1 style="margin:10px 0 0;font-size:24px;font-weight:900;color:#fff;letter-spacing:-0.5px;">${headerTitle}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:36px 40px;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="background:#F5F1EC;padding:20px 40px;border-top:1px solid #E8E3DD;text-align:center;">
                <p style="margin:0 0 12px;font-size:12px;color:#5a6b5e;line-height:1.6;">
                  Precisa de ajuda? <a href="${SUPPORT_WHATSAPP_URL}" style="color:#16856f;font-weight:700;text-decoration:none;">Fale com a Uvits pelo WhatsApp: (19) 99856-6115</a>
                </p>
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
  `;
}

function couponBlockHtml(codigoCupom, percentualCupom) {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F1EC;border-radius:10px;padding:20px;margin:20px 0;">
      <tr><td style="text-align:center;">
        <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#5a6b5e;">Seu cupom de indicação</p>
        <p style="margin:0 0 4px;font-size:28px;font-weight:900;color:#1C2620;letter-spacing:1px;">${escapeHtml(codigoCupom)}</p>
        <p style="margin:0;font-size:13px;color:#5a6b5e;">${escapeHtml(percentualCupom)}% de desconto para os seus pacientes/clientes</p>
      </td></tr>
    </table>
    <p style="margin:0 0 20px;font-size:13px;color:#5a6b5e;line-height:1.7;">
      Compartilhe esse código com os seus pacientes — eles aplicam no site da Uvits na hora de finalizar a compra
      (funciona junto com desconto do Pix).
    </p>
  `;
}

function mensagemAtivacao(dados, reativacao = false) {
  const nome = escapeHtml(dados.nome);
  const contato = escapeHtml(dados.contatoEmpresa || 'contato@uvits.com.br');
  const codigo = dados.codigoCupom ? escapeHtml(dados.codigoCupom) : null;
  const percentual = dados.percentualCupom ? escapeHtml(dados.percentualCupom) : null;
  const acao = reativacao ? 'reativado' : 'ativado';
  const complemento = reativacao
    ? 'Seu benefício e o seu cupom voltaram a ficar disponíveis.'
    : 'A partir de agora, você já pode participar do programa <strong>Uvits Pro Prescritor</strong>.';
  const complementoTexto = reativacao
    ? ' Seu benefício e o seu cupom voltaram a ficar disponíveis.'
    : ' A partir de agora, você já pode participar do programa Uvits Pro Prescritor.';

  return {
    para: dados.email,
    subject: `Seu cadastro como prescritor foi ${acao}`,
    html: layoutPrescritor({
      headerTitle: `Cadastro ${acao}!`,
      bodyHtml: `
        <p style="margin:0 0 16px;font-size:15px;color:#1C2620;font-weight:700;">Olá, ${nome}!</p>
        <p style="margin:0 0 20px;font-size:14px;color:#5a6b5e;line-height:1.7;">
          Seu cadastro como prescritor foi ${acao}. ${complemento}
        </p>
        ${codigo ? couponBlockHtml(codigo, percentual || '') : ''}
        <p style="margin:0;font-size:13px;color:#5a6b5e;line-height:1.7;">
          ${codigo ? 'Use e compartilhe esse código com seus pacientes nas compras feitas no site da Uvits.' : ''}
          Em caso de dúvida, fale com a nossa equipe pelo e-mail
          <a href="mailto:${contato}" style="color:#2EC4A5;">${contato}</a>.
        </p>
      `,
    }),
    text: `Olá, ${dados.nome}! Seu cadastro como prescritor foi ${acao}.${complementoTexto}${dados.codigoCupom ? ` Seu código atual é ${dados.codigoCupom}. Use e compartilhe esse código com seus pacientes nas compras no site da Uvits.` : ''} Em caso de dúvida, entre em contato pelo e-mail ${dados.contatoEmpresa || 'contato@uvits.com.br'} ou pelo WhatsApp (19) 99856-6115: ${SUPPORT_WHATSAPP_URL}.`,
  };
}

const EVENTOS = {
  // Já em produção desde o cadastro.js original — migrado pra cá sem
  // mudança de conteúdo (mesmo HTML, mesmos dois e-mails).
  cadastro_recebido(dados) {
    const { nome, email, whatsapp, profissao, conselho } = dados;
    const timestamp = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    const paraPrescritor = {
      para: email,
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
                    <a href="${SUPPORT_WHATSAPP_URL}" style="display:inline-block;color:#16856f;font-size:13px;font-weight:700;padding:12px 0;margin:8px 0 0 16px;text-decoration:none;">
                      Falar como prescritor pelo WhatsApp
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
      `,
    };

    const paraInterno = {
      para: TO_EMAIL.includes(',') ? TO_EMAIL.split(',').map((e) => e.trim()) : TO_EMAIL,
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
      `,
    };

    return [paraPrescritor, paraInterno];
  },

  reprovado(dados) {
    const nome = escapeHtml(dados.nome);
    return {
      para: dados.email,
      subject: 'Sobre o seu cadastro — Uvits Pro Prescritor',
      html: layoutPrescritor({
        headerTitle: 'Sobre o seu cadastro',
        bodyHtml: `
          <p style="margin:0 0 16px;font-size:15px;color:#1C2620;font-weight:700;">Olá, ${nome}.</p>
          <p style="margin:0 0 20px;font-size:14px;color:#5a6b5e;line-height:1.7;">
            Depois de analisar o seu cadastro, não foi possível confirmar a sua participação no programa
            <strong>Uvits Pro Prescritor</strong> neste momento. Se tiver dúvidas, entre em contato com a
            nossa equipe pelo e-mail <a href="mailto:contato@uvits.com.br" style="color:#2EC4A5;">contato@uvits.com.br</a>.
          </p>
        `,
      }),
    };
  },

  prescriber_activated(dados) {
    return mensagemAtivacao(dados);
  },

  prescriber_reactivated(dados) {
    return mensagemAtivacao(dados, true);
  },

  prescriber_code_changed(dados) {
    const nome = escapeHtml(dados.nome);
    const codigo = escapeHtml(dados.codigoCupom);
    const contato = escapeHtml(dados.contatoEmpresa || 'contato@uvits.com.br');
    return {
      para: dados.email,
      subject: 'Seu código de prescritor foi alterado',
      html: layoutPrescritor({
        headerTitle: 'Código atualizado',
        bodyHtml: `
          <p style="margin:0 0 16px;font-size:15px;color:#1C2620;font-weight:700;">Olá, ${nome}!</p>
          <p style="margin:0 0 20px;font-size:14px;color:#5a6b5e;line-height:1.7;">
            Seu código de prescritor foi alterado. A partir de agora, utilize e compartilhe o novo código abaixo.
          </p>
          ${couponBlockHtml(codigo, dados.percentualCupom || '')}
          <p style="margin:0;font-size:13px;color:#8B3030;line-height:1.7;">
            <strong>Se você não solicitou essa alteração, entre em contato com a nossa equipe para verificarmos o ocorrido.</strong>
            Fale conosco pelo e-mail <a href="mailto:${contato}" style="color:#2EC4A5;">${contato}</a>.
          </p>
        `,
      }),
      text: `Olá, ${dados.nome}! Seu código de prescritor foi alterado para ${dados.codigoCupom}. A partir de agora, utilize e compartilhe esse novo código. Se você não solicitou essa alteração, entre em contato com a nossa equipe pelo e-mail ${dados.contatoEmpresa || 'contato@uvits.com.br'} ou pelo WhatsApp (19) 99856-6115: ${SUPPORT_WHATSAPP_URL}.`,
    };
  },

  // Já em produção desde a Fase 5 — aviso operacional pra equipe, não pro
  // prescritor. Único evento com destinatário configurável (NOTIFICATION_EMAIL
  // no painel do Worker) com fallback pro TO_EMAIL.
  cupom_indicacao_reposicao(dados) {
    const codigo = escapeHtml(dados.codigo);
    return {
      para: dados.destinatario || TO_EMAIL,
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

/**
 * Envia a(s) mensagem(ns) de um evento. Nunca lança — retorna
 * { ok, resultados } onde resultados[i] é o sucesso (bool) da mensagem i,
 * na mesma ordem que o evento retornou (relevante pra cadastro_recebido,
 * que manda duas mensagens e precisa rastrear o e-mail do prescritor
 * especificamente).
 */
async function enviarNotificacao(evento, dados) {
  const construtor = EVENTOS[evento];
  if (!construtor) {
    return { ok: false, error: 'Evento desconhecido', resultados: [] };
  }

  const mensagens = construtor(dados || {});
  const lista = Array.isArray(mensagens) ? mensagens : [mensagens];

  const settled = await Promise.allSettled(
    lista.map((m) => resend.emails.send({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: m.para,
      subject: m.subject,
      html: m.html,
      text: m.text,
    })),
  );

  settled.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error(`[notificacoes] evento=${evento} mensagem=${i} falhou:`, r.reason);
    } else if (r.value?.error) {
      console.error(`[notificacoes] evento=${evento} mensagem=${i} rejeitada pelo provedor`);
    }
  });

  const resultados = settled.map((r) => r.status === 'fulfilled' && !r.value?.error);
  return { ok: resultados.some(Boolean), resultados };
}

module.exports = { enviarNotificacao, EVENTOS, SUPPORT_WHATSAPP_URL };
