import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const project = 'politicfy-cloudsuite';
const region = 'southamerica-east1';
const repository = `${region}-docker.pkg.dev/${project}/cloudsuite/cloudsuite-api:latest`;
const service = 'cloudsuite-api';
const serviceAccount = `cloudsuite-api@${project}.iam.gserviceaccount.com`;
const executable = (name) => process.platform === 'win32' ? `${name}.cmd` : name;

function run(command, args, options = {}) {
  execFileSync(executable(command), args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32', ...options });
}

run('gcloud', ['builds', 'submit', 'server', `--project=${project}`, `--tag=${repository}`]);
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'cloudsuite-run-'));
const environmentFile = join(temporaryDirectory, 'environment.yaml');
writeFileSync(environmentFile, [
  `PROJECT_ID: ${project}`,
  `GOOGLE_CLOUD_PROJECT: ${project}`,
  'APP_URL: https://app.politicfy.com',
  'WEB_ORIGINS: "https://app.politicfy.com,https://politicfy-cloudsuite.web.app,https://politicfy-cloudsuite.firebaseapp.com,http://localhost:5173,http://127.0.0.1:5173"'
].join('\n'));

try {
  run('gcloud', [
    'run', 'deploy', service,
    `--project=${project}`,
    `--region=${region}`,
    `--image=${repository}`,
    `--service-account=${serviceAccount}`,
    // La política de organización prohíbe bindings allUsers; esta opción publica
    // el endpoint sin crear ese binding, para que Firebase Hosting pueda usarlo.
    '--no-invoker-iam-check',
    '--port=8080',
    '--min-instances=0',
    `--env-vars-file=${environmentFile}`,
    '--set-secrets=RESEND_API_KEY=RESEND_API_KEY:latest,GEMINI_API_KEY=GEMINI_API_KEY:latest,GOOGLE_MAPS_API_KEY=GOOGLE_MAPS_API_KEY:latest'
  ]);
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}

const apiUrl = execFileSync(executable('gcloud'), ['run', 'services', 'describe', service, `--project=${project}`, `--region=${region}`, '--format=value(status.url)'], { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' }).trim();
run('npm', ['run', 'build'], { cwd: resolve(root, 'web'), env: { ...process.env, VITE_FIREBASE_API_URL: apiUrl } });
run('firebase', ['deploy', '--only', 'hosting', `--project=${project}`]);
console.log(`CloudSuite desplegado. API: ${apiUrl}`);
