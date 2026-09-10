import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const root = resolve(import.meta.dirname, '..');
const webEnvPath = resolve(root, 'web', '.env');
const serverEnvPath = resolve(root, 'server', '.env');

function updateEnvFile(filePath, values) {
  mkdirSync(dirname(filePath), { recursive: true });
  const existing = existsSync(filePath) ? readFileSync(filePath, 'utf8') : '';
  const newline = existing.includes('\r\n') ? '\r\n' : '\n';
  let updated = existing;

  for (const [key, value] of Object.entries(values)) {
    const assignment = `${key}=${value}`;
    const expression = new RegExp(`^${key}=.*$`, 'm');
    updated = expression.test(updated)
      ? updated.replace(expression, assignment)
      : `${updated}${updated && !updated.endsWith('\n') && !updated.endsWith('\r') ? newline : ''}${assignment}${newline}`;
  }

  writeFileSync(filePath, updated, 'utf8');
}

const prompt = readline.createInterface({ input, output });

try {
  output.write('Configuración local de CloudSuite (las claves no se mostrarán al finalizar).\n\n');
  const mapsKey = (await prompt.question('Pegá tu clave de Google Maps: ')).trim();
  const geminiKey = (await prompt.question('Pegá tu clave de Gemini: ')).trim();

  if (!mapsKey || !geminiKey) {
    throw new Error('Ambas claves son obligatorias. No se guardó ningún cambio.');
  }

  updateEnvFile(webEnvPath, { VITE_GOOGLE_MAPS_API_KEY: mapsKey });
  updateEnvFile(serverEnvPath, {
    GOOGLE_MAPS_API_KEY: mapsKey,
    GEMINI_API_KEY: geminiKey
  });

  output.write('\nClaves guardadas correctamente. No se mostrarán sus valores.\n');
  output.write('Reiniciá web y server para aplicar la configuración.\n');
} catch (error) {
  output.write(`\nNo se completó la configuración: ${error instanceof Error ? error.message : 'error desconocido'}.\n`);
  process.exitCode = 1;
} finally {
  prompt.close();
}
