/**
 * Gerador de hash de senha para o usuário administrador
 *
 * Uso:
 *   node scripts/hash-senha.js
 *
 * O script pedirá a senha e exibirá o hash bcrypt pronto
 * para colar no INSERT do schema.sql
 */

const bcrypt   = require('bcryptjs');
const readline = require('readline');

const rl = readline.createInterface({
  input:  process.stdin,
  output: process.stdout
});

// Ocultar a senha no terminal
const perguntarSenha = () => new Promise((resolve) => {
  process.stdout.write('Digite a senha do administrador: ');

  let senha = '';
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');

  process.stdin.on('data', (char) => {
    if (char === '\n' || char === '\r' || char === '\u0004') {
      process.stdin.setRawMode(false);
      process.stdout.write('\n');
      resolve(senha);
    } else if (char === '\u0003') {
      process.exit();
    } else if (char === '\u007f') {
      senha = senha.slice(0, -1);
    } else {
      senha += char;
      process.stdout.write('*');
    }
  });
});

(async () => {
  try {
    const senha = await perguntarSenha();

    if (senha.length < 8) {
      console.error('\n❌ A senha deve ter ao menos 8 caracteres.');
      process.exit(1);
    }

    const hash = await bcrypt.hash(senha, 12);

    console.log('\n✅ Hash gerado com sucesso!\n');
    console.log('Cole no schema.sql:\n');
    console.log(`INSERT INTO usuarios (nome, email, senha_hash)`);
    console.log(`VALUES ('Sergio', 'contato@uvits.com.br', '${hash}');\n`);

    rl.close();
    process.exit(0);
  } catch (err) {
    console.error('Erro:', err.message);
    process.exit(1);
  }
})();
