// Da eseguire su un computer in Italia (il portale blocca spesso gli IP esteri dei runner GitHub):
// scarica i dati, li salva nel repository e li spinge. Il push fa ripartire la pubblicazione del sito.
//   node scripts/sync.mjs

import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const run = (cmd, args) => execFileSync(cmd, args, { cwd: ROOT, stdio: 'inherit' });
const quiet = (cmd, args) => execFileSync(cmd, args, { cwd: ROOT }).toString().trim();

run('git', ['pull', '--rebase', '--quiet']);
run(process.execPath, ['scripts/fetch.mjs']);
run('git', ['add', 'data/']);
if (quiet('git', ['diff', '--cached', '--name-only'])) {
  run('git', ['commit', '--quiet', '-m', `Dati bandi ${new Date().toISOString().slice(0, 10)}`]);
  run('git', ['push', '--quiet']);
  console.log('Dati spinti: il sito si ripubblica da solo.');
} else {
  console.log('Nessuna novità nei dati.');
}
