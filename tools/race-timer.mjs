import { createServer } from 'node:http';
import { readFile, writeFile, rename, mkdir, appendFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { RaceTimer } from './race-timer-core.mjs';
import { formatRaceTime } from '../assets/js/race-time.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const local = join(process.env.LOCALAPPDATA || root, 'Carruleddhi', 'race-timer');
await mkdir(local, { recursive: true });
const configPath = join(local, 'config.json');
let config;
try { config = JSON.parse(await readFile(configPath, 'utf8')); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  config = { port: 17864, token: randomBytes(32).toString('hex'), origin: 'https://www.carruleddhishow.com' };
  try { await writeFile(configPath, JSON.stringify(config), { flag: 'wx' }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; config = JSON.parse(await readFile(configPath, 'utf8')); }
}
const action = process.argv[2] || 'status';
const address = `http://127.0.0.1:${config.port}`;

if (action === 'serve') {
  // The password stays in the existing local env file, never in an OBS URL or profile.
  const env = Object.fromEntries((await readFile(join(root, '.env.local'), 'utf8')).split(/\r?\n/)
    .filter(line => /^[A-Z_]+\s*=/.test(line)).map(line => {
      const at = line.indexOf('='); return [line.slice(0, at).trim(), line.slice(at + 1).trim().replace(/^(["'])(.*)\1$/, '$2')];
    }));
  const stateFile = join(local, 'state.json');
  const timer = new RaceTimer({
    read: async () => { try { return JSON.parse(await readFile(stateFile, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } },
    write: async state => {
      await writeFile(`${stateFile}.tmp`, JSON.stringify(state));
      await rename(`${stateFile}.tmp`, stateFile);
      await writeFile(join(local, 'status.txt'), `${state.name || ''}\n${state.status}\n${formatRaceTime(state.raceTimeMs) || ''}`);
    },
    api: async (route, body) => {
      const result = await fetch(`${config.origin}/api/carruleddhi/${route}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Carruleddhi-Roster-Key': env.ROSTER_KEY },
        body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
      });
      const data = await result.json();
      if (!result.ok || !data.ok) throw new Error(data.code || `HTTP ${result.status}`);
      return data;
    },
  });
  let queue = Promise.resolve();
  const server = createServer((request, response) => {
    const receivedAt = Date.now();
    const supplied = Buffer.from(request.headers.authorization || '');
    const expected = Buffer.from(`Bearer ${config.token}`);
    if (request.method !== 'POST' || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      response.writeHead(403); response.end(); return;
    }
    const command = request.url.slice(1);
    queue = queue.then(async () => {
      try {
        const state = await timer.command(command, receivedAt);
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ ok: true, ...state }));
      } catch (error) {
        await appendFile(join(local, 'errors.log'), `${new Date().toISOString()} ${command}: ${error.message}\n`);
        response.writeHead(422, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ ok: false, error: error.message }));
      }
    }).catch(() => { response.destroy(); });
  });
  server.on('error', error => { if (error.code === 'EADDRINUSE') process.exit(0); throw error; });
  server.listen(config.port, '127.0.0.1');
} else {
  if (!['start', 'stop', 'status'].includes(action)) throw new Error('Use start, stop, status or serve');
  const send = () => fetch(`${address}/${action}`, { method: 'POST', headers: { Authorization: `Bearer ${config.token}` }, signal: AbortSignal.timeout(35000) });
  let response;
  try { response = await send(); }
  catch (error) {
    if (error.cause?.code !== 'ECONNREFUSED') throw error;
    spawn(process.execPath, [fileURLToPath(import.meta.url), 'serve'], { detached: true, windowsHide: true, stdio: 'ignore' }).unref();
    for (let i = 0; i < 30; i++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      try { response = await send(); break; } catch (e) { if (e.cause?.code !== 'ECONNREFUSED') throw e; }
    }
  }
  if (!response) throw new Error('Nie uruchomiono zegara.');
  const data = await response.json();
  if (!data.ok) { console.error(data.error); process.exitCode = 1; }
  else console.log(`${data.name || 'Zegar'}: ${data.status} ${formatRaceTime(data.raceTimeMs)}`);
}
