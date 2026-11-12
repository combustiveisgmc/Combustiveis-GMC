// Cria (ou redefine a senha de) um usuário da gestão.
//
//   npm run criar-usuario -- <usuario> "<Nome completo>" [admin|gestor] [--remoto]
//
// Sem --remoto grava no banco local (teste). Com --remoto grava no banco da Cloudflare.
// A senha é gerada aqui e mostrada uma única vez; entregue-a para a pessoa.
import { execSync } from 'node:child_process';
import { writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gerarHashSenha } from '../lib/auth.js';

const args = process.argv.slice(2);
const remoto = args.includes('--remoto');
const [usuarioBruto, nome, papel = 'gestor'] = args.filter((a) => !a.startsWith('--'));

if (!usuarioBruto || !nome || !['admin', 'gestor'].includes(papel)) {
  console.error('Uso: npm run criar-usuario -- <usuario> "<Nome completo>" [admin|gestor] [--remoto]');
  process.exit(1);
}
const usuario = usuarioBruto.trim().toLowerCase();
if (!/^[a-z0-9._-]{3,64}$/.test(usuario)) {
  console.error('Usuário deve ter 3 a 64 caracteres: letras sem acento, números, ponto, hífen ou sublinhado.');
  process.exit(1);
}

// senha legível, sem caracteres ambíguos (0/O, 1/l)
const alfabeto = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
const bytes = crypto.getRandomValues(new Uint8Array(12));
const senha = Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join('');

const hash = await gerarHashSenha(senha);
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const sql =
  `INSERT INTO usuarios (usuario, nome, senha_hash, papel) VALUES (${q(usuario)}, ${q(nome)}, ${q(hash)}, ${q(papel)})\n` +
  `  ON CONFLICT(usuario) DO UPDATE SET nome = excluded.nome, senha_hash = excluded.senha_hash, papel = excluded.papel, ativo = 1;\n` +
  `DELETE FROM sessoes WHERE usuario_id = (SELECT id FROM usuarios WHERE usuario = ${q(usuario)});\n` +
  `DELETE FROM tentativas_login WHERE usuario = ${q(usuario)};\n`;

const pasta = mkdtempSync(join(tmpdir(), 'usuario-'));
const arquivo = join(pasta, 'usuario.sql');
writeFileSync(arquivo, sql, 'utf8');
try {
  // D1_LOCAL_DIR: pasta do banco local, se o caminho padrão ficar longo demais no Windows
  const persist = !remoto && process.env.D1_LOCAL_DIR ? ` --persist-to "${process.env.D1_LOCAL_DIR}"` : '';
  execSync(`npx wrangler d1 execute DB ${remoto ? '--remote' : '--local'}${persist} --file "${arquivo}"`, {
    stdio: ['inherit', 'ignore', 'inherit']
  });
} finally {
  rmSync(pasta, { recursive: true, force: true });
}

console.log('');
console.log(`Usuário pronto (${remoto ? 'Cloudflare' : 'local'}):`);
console.log(`  usuário: ${usuario}`);
console.log(`  nome:    ${nome}`);
console.log(`  papel:   ${papel}`);
console.log(`  senha:   ${senha}`);
console.log('');
console.log('Guarde essa senha agora; ela não fica salva em lugar nenhum.');
