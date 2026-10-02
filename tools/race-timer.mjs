import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { RaceTimer, controlActions, createBroadcastApi } from './race-timer-core.mjs';
import { formatRaceTime } from '../assets/js/race-time.js';

export const protocol = 3;

export function createRaceTimerServer(timer, { token, onError = async () => {} }) {
  if (typeof token !== 'string' || !token) throw new Error('Brak tokena IPC.');
  return createServer((request, response) => {
    const supplied = Buffer.from(request.headers.authorization || '');
    const expected = Buffer.from(`Bearer ${token}`);
    const send = (status, data) => {
      response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ ...data, protocol }));
    };
    if (request.method !== 'POST' || request.headers.origin || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      send(403, { ok: false, error: 'IPC_FORBIDDEN' }); return;
    }
    const action = request.url.slice(1);
    if (action === 'health') { send(200, { ok: true, role: 'control-client', authority: 'remote-db' }); return; }
    if (request.headers['x-race-timer-at'] !== undefined || request.headers['x-race-timer-protocol'] !== String(protocol)) {
      send(409, { ok: false, error: 'IPC_PROTOCOL_MISMATCH' }); return;
    }
    void (async () => {
      try {
        let raw = '';
        for await (const chunk of request) {
          raw += chunk;
          if (Buffer.byteLength(raw) > 1024) throw new Error('IPC_BODY_TOO_LARGE');
        }
        const options = raw ? JSON.parse(raw) : {};
        if (action === 'stop' && !options?.runId) throw new Error('STOP wymaga runId z aktualnego statusu.');
        const snapshot = await timer.command(action, options);
        send(200, { ok: true, ...snapshot });
      } catch (error) {
        try { await onError(error, action); } catch { /* Diagnostics cannot change the control result. */ }
        send(422, { ok: false, error: error.message, connection: 'unconfirmed' });
      }
    })().catch(() => response.destroy());
  });
}

export function describeSnapshot(data) {
  const state = data.state;
  const person = state.participant;
  const name = person ? `#${person.startNumber} ${person.firstName} ${person.lastName}` : 'Brak zawodnika';
  const time = state.run_status === 'FINISHED' ? ` ${formatRaceTime(state.elapsed_ms)}` : '';
  return `${name}: ${state.run_status}${time}\nrunId=${state.run_id ?? '-'}\nBackend serverNow=${data.serverNow ?? '-'} (protocol ${protocol})`;
}

async function main() {
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  if (!process.env.LOCALAPPDATA) throw new Error('Brak LOCALAPPDATA; nie zapisujemy tokena IPC w projekcie.');
  const local = join(process.env.LOCALAPPDATA, 'Carruleddhi', 'race-timer');
  await mkdir(local, { recursive: true });
  const diagnostic = text => writeFile(join(local, 'status.txt'), `DIAGNOSTYKA, NIE ZEGAR NA ZYWO. Odswiez: node tools/race-timer.mjs status\n${text}\n`);
  const onError = async (error, action = 'network') => {
    try {
      await appendFile(join(local, 'errors.log'), `${new Date().toISOString()} ${action}: ${error.message}\n`);
      await diagnostic(`BRAK POTWIERDZENIA / STAN NIEZNANY\n${error.message}\nBrak lokalnego pomiaru i brak automatycznego ponawiania.`);
    } catch { console.error('Nie zapisano diagnostyki kontrolera.'); }
  };
  try {
    const configPath = join(local, 'config.json');
    let config;
    try { config = JSON.parse(await readFile(configPath, 'utf8')); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      config = { port: 17864, token: randomBytes(32).toString('hex'), origin: 'https://www.carruleddhishow.com' };
      try { await writeFile(configPath, JSON.stringify(config), { flag: 'wx', mode: 0o600 }); }
      catch (error) { if (error.code !== 'EEXIST') throw error; config = JSON.parse(await readFile(configPath, 'utf8')); }
    }
    if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535 || typeof config.token !== 'string' || !config.token) throw new Error('Nieprawidlowa konfiguracja IPC.');
    const action = process.argv[2] || 'status';
    const extra = process.argv.slice(3);
    if (extra.length && !(action === 'stop' && extra.length === 2 && extra[0] === '--run-id')) throw new Error('Use stop --run-id UUID');
    if (action === 'serve') {
      let env = {};
      try { env = parseEnv(await readFile(join(root, '.env.local'), 'utf8')); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      const timer = new RaceTimer({ api: createBroadcastApi({
        origin: config.origin,
        token: process.env.BROADCAST_CONTROL_TOKEN || env.BROADCAST_CONTROL_TOKEN,
        rosterKey: process.env.ROSTER_KEY || env.ROSTER_KEY,
      }) });
      const server = createRaceTimerServer(timer, { token: config.token, onError });
      server.on('error', error => { void onError(error, 'serve'); process.exitCode = 1; });
      await diagnostic('Kontroler uruchomiony; stan backendu nie zostal jeszcze odczytany.');
      server.listen(config.port, '127.0.0.1');
      return;
    }
    if (!['status', 'health', ...controlActions].includes(action)) throw new Error('Use start, stop, status, health, serve, show-participant, hide-participant, show-sponsors or hide-sponsors');
    const send = async (command, body) => {
      let response;
      try {
        response = await fetch(`http://127.0.0.1:${config.port}/${command}`, {
          method: 'POST', headers: { Authorization: `Bearer ${config.token}`, 'X-Race-Timer-Protocol': String(protocol), 'Content-Type': 'application/json' },
          body: JSON.stringify(body || {}), signal: AbortSignal.timeout(35000), redirect: 'error',
        });
      } catch { throw new Error('Brak odpowiedzi pomocnika. Stan nieznany. Wlasciciel musi uruchomic sprawdzony kontroler; nie uruchamiamy go automatycznie.'); }
      const data = await response.json();
      if (data.protocol !== protocol) throw new Error('Dziala starszy pomocnik. Wlasciciel musi go zatrzymac przed migracja; nie wyslano komendy sterujacej.');
      if (!response.ok || !data.ok) throw new Error(data.error || 'IPC_ERROR');
      return data;
    };
    // The handshake pins STOP to the run observed before dispatch, not a later run.
    let data = await send(action === 'health' ? 'health' : 'status');
    if (action === 'health') { console.log(`control-client protocol ${data.protocol}; backend nie sprawdzony`); return; }
    if (action !== 'status') {
      const body = action === 'stop' ? { runId: extra[1] || data.state.run_id } : {};
      try { data = await send(action, body); }
      catch (error) { throw new Error(`${error.message}${body.runId ? ` runId=${body.runId}; ponowienie: stop --run-id ${body.runId}` : ''}`, { cause: error }); }
    }
    const text = describeSnapshot(data);
    try { await diagnostic(`Migawka z ostatniego zapytania; moze byc juz nieaktualna.\n${text}`); }
    catch { console.error('Backend potwierdzil stan, ale nie zapisano diagnostyki.'); }
    console.log(text);
  } catch (error) {
    await onError(error, process.argv[2] || 'status');
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
