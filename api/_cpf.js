// Validação de CPF (Fase 4 — CPF/metafield). O CPF nunca é armazenado nesta
// aplicação (LGPD) — esta função só valida o formato/dígito verificador
// antes de repassar o valor em trânsito pro Worker. Nunca logar o valor.

function calcularDigitoVerificador(base) {
  let soma = 0;
  let peso = base.length + 1;
  for (const digito of base) {
    soma += parseInt(digito, 10) * peso;
    peso--;
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/** Valida um CPF (formatado ou só dígitos) pelo algoritmo padrão dos dígitos verificadores. */
function validarCpf(cpf) {
  const digitos = String(cpf ?? '').replace(/\D/g, '');

  if (digitos.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digitos)) return false; // todos os dígitos iguais (000..., 111..., etc.)

  const d1 = calcularDigitoVerificador(digitos.slice(0, 9));
  const d2 = calcularDigitoVerificador(digitos.slice(0, 9) + d1);

  return digitos === digitos.slice(0, 9) + String(d1) + String(d2);
}

module.exports = { validarCpf };
