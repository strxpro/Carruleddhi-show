/** Only local transitions are serialized. No network request may hold this queue. */
export class RaceTimer {
  constructor({ read, write, api, onError = () => {} }) {
    Object.assign(this, { read, write, api, onError });
    this.queue = Promise.resolve();
  }

  local(change) {
    const task = this.queue.then(async () => {
      if (!this.state) this.state = await this.read() || { status: 'idle' };
      return change();
    });
    this.queue = task.catch(() => {});
    return task;
  }

  async persist(next) {
    // Keep a frozen STOP in memory even if disk writing fails; retry cannot extend it.
    this.state = next;
    await this.write(next);
    return { ...next };
  }

  startLookup(startedAt) {
    const task = (async () => {
      try {
        const data = await this.api('broadcast-admin', { action: 'state' });
        const person = data.state?.participant;
        if (!person || !data.participants?.some(p => p.id === person.id)) throw new Error('Najpierw wybierz zawodnika w panelu.');
        if (data.timingReady !== true) throw new Error('Najpierw wdroż migrację czasu przejazdu.');
        await this.local(async () => {
          if (this.state.startedAt !== startedAt) return;
          const next = { ...this.state, id: person.id, name: `#${person.startNumber} ${person.firstName} ${person.lastName}` };
          if (next.status === 'starting') next.status = 'running';
          await this.persist(next);
          if (next.status === 'pending') this.save();
        });
      } catch (error) {
        await this.local(async () => {
          if (this.state.startedAt !== startedAt) return;
          await this.persist({ ...this.state, status: this.state.status === 'pending' ? 'pending' : 'failed', error: error.message });
        });
        await this.onError(error);
      }
    })().catch(error => this.onError(error)).finally(() => { if (this.starting === task) this.starting = null; });
    this.starting = task;
  }

  save() {
    if (this.saving) return;
    const next = { ...this.state };
    if (!next.id) return;
    const task = (async () => {
      try {
        await this.api('voting-admin', { action: 'save', id: next.id, raceTimeMs: next.raceTimeMs });
        await this.local(async () => {
          const saved = { ...next, status: 'saved' };
          delete saved.error;
          // Failed acknowledgement persistence must leave the durable pending retry intact.
          await this.write(saved);
          this.state = saved;
          this.saving = null;
        });
      } catch (error) {
        await this.local(() => this.persist({ ...next, error: error.message }));
        await this.onError(error);
      }
    })().catch(error => this.onError(error)).finally(() => { if (this.saving === task) this.saving = null; });
    this.saving = task;
  }

  command(action, at = Date.now()) {
    return this.local(async () => {
      const previous = this.state;
      if (action === 'status') return { ...previous };
      if (!['start', 'stop'].includes(action)) throw new Error('Nieznana komenda zegara.');
      if (!Number.isSafeInteger(at) || at < 0) throw new Error('Nieprawidłowy znacznik czasu.');
      const lastAt = Math.max(previous.stoppedAt ?? -1, previous.startedAt ?? -1, previous.lastCommandAt ?? -1);
      if (at < lastAt) throw new Error('Opóźniona komenda zegara została odrzucona.');
      if (action === 'start') {
        if (previous.status === 'starting' && !this.starting) throw new Error('Przerwany START. Naciśnij STOP i zachowaj pomiar do ręcznego przypisania.');
        if (['starting', 'running'].includes(previous.status)) return { ...previous };
        if (previous.status === 'pending') throw new Error('Najpierw ponów STOP, aby zapisać poprzedni wynik.');
        if (at === lastAt) return { ...previous };
        const next = await this.persist({ status: 'starting', startedAt: at });
        this.startLookup(at);
        return next;
      }
      if (['idle', 'saved'].includes(previous.status)) {
        // A STOP received before a delayed START must not arm that obsolete START.
        return this.persist({ ...previous, lastCommandAt: Math.max(at, previous.lastCommandAt || 0) });
      }
      const next = previous.status === 'pending' ? { ...previous } : {
        ...previous, status: 'pending', stoppedAt: at, raceTimeMs: at - previous.startedAt,
      };
      if (!Number.isInteger(next.raceTimeMs) || next.raceTimeMs < 0 || next.raceTimeMs > 2147483647) throw new Error('Nieprawidłowy pomiar zegara; wpisz czas ręcznie.');
      if (!next.id && !this.starting) next.error = 'Nie ustalono zawodnika START. Zachowaj czas i przypisz wynik ręcznie; STOP nie wybierze innej osoby.';
      const result = await this.persist(next);
      this.save();
      return result;
    });
  }
}
