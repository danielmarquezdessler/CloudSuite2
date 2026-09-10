import { execFileSync } from 'node:child_process';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const project = 'politicfy-cloudsuite';
const secret = 'RESEND_API_KEY';
const gcloud = process.platform === 'win32' ? 'gcloud.cmd' : 'gcloud';
const commandOptions = { shell: process.platform === 'win32' };
const prompt = readline.createInterface({ input, output });

try {
  const key = (await prompt.question('Pegá tu clave de Resend: ')).trim();
  if (!key) throw new Error('La clave de Resend es obligatoria. No se realizó ningún cambio.');

  try {
    execFileSync(gcloud, ['secrets', 'describe', secret, `--project=${project}`], { stdio: 'ignore', ...commandOptions });
  } catch {
    execFileSync(gcloud, ['secrets', 'create', secret, `--project=${project}`, '--replication-policy=automatic'], { stdio: 'ignore', ...commandOptions });
  }

  execFileSync(gcloud, ['secrets', 'versions', 'add', secret, `--project=${project}`, '--data-file=-'], {
    input: key,
    stdio: ['pipe', 'ignore', 'inherit'],
    ...commandOptions
  });
  output.write('RESEND_API_KEY se guardó en Secret Manager sin mostrar su valor.\n');
} finally {
  prompt.close();
}
