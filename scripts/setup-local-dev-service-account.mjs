import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const project = process.env.GOOGLE_CLOUD_PROJECT ?? 'politicfy-cloudsuite';
const accountId = 'cloudsuite-local-dev';
const account = `${accountId}@${project}.iam.gserviceaccount.com`;
const bucket = process.env.FIREBASE_STORAGE_BUCKET ?? 'politicfy-cloudsuite.firebasestorage.app';
const credentialsRelativePath = './.secrets/local-dev-key.json';
const credentialsPath = resolve(root, 'server', '.secrets', 'local-dev-key.json');
const envPath = resolve(root, 'server', '.env');
const gcloud = process.platform === 'win32' ? 'gcloud.cmd' : 'gcloud';
const commandOptions = { shell: process.platform === 'win32', stdio: 'inherit' };

// Con shell:true, Node concatena los argumentos para cmd.exe sin escaparlos.
// Las rutas del workspace contienen "CloudSuite 2", por eso cada argumento
// que contenga espacios se protege explícitamente antes de invocar gcloud.cmd.
const shellArgs = (args) => process.platform === 'win32' ? args.map((argument) => /[\s"]/u.test(argument) ? `"${argument.replace(/"/gu, '""')}"` : argument) : args;
const run = (args) => execFileSync(gcloud, shellArgs(args), commandOptions);
const upsertEnv = (source, key, value) => {
  const line = `${key}=${value}`;
  const expression = new RegExp(`^${key}=.*$`, 'm');
  return expression.test(source) ? source.replace(expression, line) : `${source.replace(/\s*$/, '')}\n${line}\n`;
};

try {
  try {
    run(['iam', 'service-accounts', 'describe', account, `--project=${project}`]);
  } catch {
    run(['iam', 'service-accounts', 'create', accountId, `--project=${project}`, '--display-name=CloudSuite-local-dev']);
  }

  run(['projects', 'add-iam-policy-binding', project, `--member=serviceAccount:${account}`, '--role=roles/datastore.user']);
  run(['storage', 'buckets', 'add-iam-policy-binding', `gs://${bucket}`, `--member=serviceAccount:${account}`, '--role=roles/storage.objectAdmin']);

  mkdirSync(dirname(credentialsPath), { recursive: true });
  if (!existsSync(credentialsPath)) run(['iam', 'service-accounts', 'keys', 'create', credentialsPath, `--iam-account=${account}`, `--project=${project}`]);

  const currentEnv = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
  writeFileSync(envPath, upsertEnv(currentEnv, 'GOOGLE_APPLICATION_CREDENTIALS', credentialsRelativePath));
  console.log('Cuenta de servicio local configurada. La clave quedó fuera de Git y no se mostró. Reiniciá el backend local para usarla.');
} catch (error) {
  console.error('No se pudo configurar la cuenta de servicio local. Iniciá sesión con una identidad que tenga acceso IAM al proyecto y volvé a ejecutar este script.');
  process.exitCode = 1;
}
