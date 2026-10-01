import { createServer } from 'node:http';
import { readFile, writeFile, rename, mkdir, appendFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { RaceTimer } from './race-timer-core.mjs';
import { formatRaceTime } from '../assets/js/race-time.js';

const invokedAt = Date.now();
const protocol = 2;

export function createRaceTimerServer(timer, { token, onError = async () => {}, clock = Date.now }) {
  return createServer((request, response) => {
    const receivedAt = clock();
    const supplied = Buffer.from(request.headers.authorization || '');
    const expected = Buffer.from(`Bearer ${token}`);
    if (request.method !== 'POST' || request.headers.origin || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      response.writeHead(403); response.end(); return;
    }
    const command = request.url.slice(1);
    const at = request.headers['x-race-timer-at'] === undefined ? receivedAt : Number(request.headers['x-race-timer-at']);
    const run = async () => {
      try {
        if (!Number.isSafeInteger(at) || at < 0 || at > receivedAt) throw new Error('Nieprawidłowy znacznik czasu.');
        const state = await timer.command(command, at);
        response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        response.end(JSON.stringify({ ok: true, protocol, ...state }));
      } catch (error) {
        await onError(error, command);
        response.writeHead(422, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        response.end(JSON.stringify({ ok: false, protocol, error: error.message }));
      }
    };
    // Timestamp and local state are never queued behind a remote API request.
    void run().catch(() => response.destroy());
  });
}

async function main() {
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const local = join(process.env.LOCALAPPDATA || root, 'Carruleddhi', 'race-timer');
  await mkdir(local, { recursive: true });
  const onError = async (error, command = 'network') => {
    try { await appendFile(join(local, 'errors.log'), `${new Date().toISOString()} ${command}: ${error.message}\n`); }
    catch { console.error('Nie zapisano dziennika bledow zegara.'); }
  };
  try {
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
          await writeFile(`${stateFile}.tmp`, JSON.stringify(state), { flush: true });
          await rename(`${stateFile}.tmp`, stateFile);
          try { await writeFile(join(local, 'status.txt'), `${state.name || ''}\n${state.status}\n${formatRaceTime(state.raceTimeMs) || ''}\n${state.error || ''}`); }
          catch (error) { await onError(error, 'status.txt'); }
        },
        onError,
        api: async (route, body) => {
          const result = await fetch(`${config.origin}/api/carruleddhi/${route}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Carruleddhi-Roster-Key': env.ROSTER_KEY },
            body: JSON.stringify(body), signal: AbortSignal.timeout(15000), redirect: 'error',
          });
          const data = await result.json();
          if (!result.ok || !data.ok) throw new Error(data.code || `HTTP ${result.status}`);
          return data;
        },
      });
      const server = createRaceTimerServer(timer, { token: config.token, onError });
      server.on('error', error => { if (error.code === 'EADDRINUSE') process.exit(0); throw error; });
      server.listen(config.port, '127.0.0.1');
    } else {
      if (!['start', 'stop', 'status'].includes(action)) throw new Error('Use start, stop, status or serve');
      const send = command => fetch(`${address}/${command}`, {
        method: 'POST', headers: { Authorization: `Bearer ${config.token}`, 'X-Race-Timer-At': String(invokedAt) }, signal: AbortSignal.timeout(5000),
      });
      let response;
      try { response = await send('status'); }
      catch (error) {
        if (error.cause?.code !== 'ECONNREFUSED') throw error;
        spawn(process.execPath, [fileURLToPath(import.meta.url), 'serve'], { detached: true, windowsHide: true, stdio: 'ignore' }).unref();
        for (let i = 0; i < 30; i++) {
          await new Promise(resolve => setTimeout(resolve, 100));
          try { response = await send('status'); break; } catch (e) { if (e.cause?.code !== 'ECONNREFUSED') throw e; }
        }
      }
      if (!response) throw new Error('Nie uruchomiono zegara.');
      let data = await response.json();
      if (data.protocol !== protocol && action !== 'status') throw new Error('Działa starszy pomocnik. Przed pomiarem uruchom go ponownie; nie wysłano START/STOP.');
      if (action !== 'status') data = await (await send(action)).json();
      if (!data.ok) throw new Error(data.error);
      console.log(`${data.name || 'Zegar'}: ${data.status} ${formatRaceTime(data.raceTimeMs)}${action === 'status' ? ` (protocol ${data.protocol ?? 1})` : ''}`);
    }
  } catch (error) {
    await onError(error, process.argv[2] || 'status');
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
