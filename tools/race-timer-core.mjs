/** Persist before network writes: a retry must save the original finish time. */
export class RaceTimer {
  constructor({ read, write, api }) { Object.assign(this, { read, write, api }); }
  async command(action, at = Date.now()) {
    const previous = await this.read();
    if (action === 'status') return previous || { status: 'idle' };
    if (action === 'start') {
      if (previous?.status === 'running') return previous;
      if (previous?.status === 'pending') throw new Error('Najpierw ponów STOP, aby zapisać poprzedni wynik.');
      const data = await this.api('broadcast-admin', { action: 'state' });
      const person = data.state?.participant;
      if (!person || !data.participants.some(p => p.id === person.id)) throw new Error('Najpierw wybierz zawodnika w panelu.');
      if (data.timingReady !== true) throw new Error('Najpierw wdroż migrację czasu przejazdu.');
      const next = { status: 'running', id: person.id, name: `#${person.startNumber} ${person.firstName} ${person.lastName}`, startedAt: at };
      await this.write(next);
      return next;
    }
    if (action === 'stop') {
      if (!previous || previous.status === 'saved') return previous || { status: 'idle' };
      const next = previous.status === 'pending' ? previous : {
        ...previous, status: 'pending', stoppedAt: at, raceTimeMs: at - previous.startedAt,
      };
      if (!Number.isInteger(next.raceTimeMs) || next.raceTimeMs < 0 || next.raceTimeMs > 2147483647) throw new Error('Nieprawidłowy pomiar zegara; wpisz czas ręcznie.');
      await this.write(next);
      await this.api('voting-admin', { action: 'save', id: next.id, raceTimeMs: next.raceTimeMs });
      const saved = { ...next, status: 'saved' };
      await this.write(saved);
      return saved;
    }
    throw new Error('Nieznana komenda zegara.');
  }
}
