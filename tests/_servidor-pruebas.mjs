/** Servidor local temporal para pruebas HTTP. No toca el servidor ni los datos reales de DOCE. */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function puertoLibre() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const p = server.address().port;
      server.close(() => resolve(p));
    });
  });
}

export async function iniciarServidor({ dataDir } = {}) {
  const dirPropio = !dataDir;
  const datos = dataDir || fs.mkdtempSync(path.join(os.tmpdir(), 'doce-api-tests-'));
  const port = await puertoLibre();
  let salida = '';
  const proc = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
    cwd: raiz,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'production',
      DOCE_DATA_DIR: datos,
      GEMINI_API_KEY: '', // fuerza fallback, no realiza llamadas externas
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  proc.stdout.on('data', (chunk) => { salida += chunk.toString(); });
  proc.stderr.on('data', (chunk) => { salida += chunk.toString(); });
  const url = `http://127.0.0.1:${port}`;
  let listo = false;
  for (let i = 0; i < 125; i++) {
    if (proc.exitCode !== null) break;
    try {
      const r = await fetch(url + '/api/auth/me', { signal: AbortSignal.timeout(150) });
      if (r.status === 401) { listo = true; break; }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!listo) {
    proc.kill('SIGTERM');
    throw new Error(`Servidor de prueba no inició en 12,5 s. Salida: ${salida.slice(-2500)}`);
  }
  return {
    url, datos, salida: () => salida,
    async detener() {
      if (proc.exitCode === null) {
        const cerrado = new Promise((r) => proc.once('exit', r));
        proc.kill('SIGTERM');
        await Promise.race([cerrado, new Promise((r) => setTimeout(r, 2000))]);
        if (proc.exitCode === null) proc.kill('SIGKILL');
      }
      if (dirPropio) fs.rmSync(datos, { force: true, recursive: true });
    },
  };
}

export async function solicitud(url, ruta, { method = 'GET', body, token } = {}) {
  const resp = await fetch(url + ruta, {
    method,
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(5000),
  });
  const raw = await resp.text();
  let json;
  try { json = JSON.parse(raw); } catch { json = { raw }; }
  return { status: resp.status, body: json };
}

export async function iniciarSesion(url, identificador, password = 'doce2026') {
  const r = await solicitud(url, '/api/auth/login', { method: 'POST', body: { identificador, password } });
  if (r.status !== 200 || !r.body.token) throw new Error(`Falló el login sintético: ${identificador} (${r.status})`);
  return r.body.token;
}
