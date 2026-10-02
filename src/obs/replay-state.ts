import type { BroadcastState, Participant } from './types';

/** Replay is a saved finish, never a fallback to the currently prepared driver. */
export function replayParticipant(state: BroadcastState): Participant | null {
  const person = state.last_finished_participant;
  const time = state.last_finished_elapsed_ms;
  if (!person || !state.last_finished_participant_id || person.id !== state.last_finished_participant_id
    || typeof time !== 'number' || !Number.isSafeInteger(time) || time < 0) return null;
  return { ...person, raceTimeMs: time };
}
