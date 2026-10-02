export interface Participant {
  id: string;
  firstName: string;
  lastName: string;
  startNumber: number | string;
  city: string;
  projectName: string;
  category: string;
  photo: string;
  raceTimeMs?: number | null;
}

export interface Sponsor {
  id: string;
  name: string;
  logo: string;
  url: string;
  active: boolean;
  order: number;
  tier: string;
}

export interface BroadcastState {
  id: 'main';
  revision: number;
  participant: Participant | null;
  participant_visible: boolean;
  participant_mode?: 'live' | 'replay';
  /** Optional only for deployments before the authoritative run migration. */
  current_participant_id?: string | null;
  last_finished_participant_id?: string | null;
  last_finished_participant?: Participant | null;
  run_status?: 'IDLE' | 'RUNNING' | 'FINISHED';
  started_at?: string | null;
  stopped_at?: string | null;
  elapsed_ms?: number;
  run_id?: string | null;
  last_finished_elapsed_ms?: number | null;
  sponsors_enabled: boolean;
  sponsors: Sponsor[];
  updated_at: string;
}

export interface BroadcastConnection {
  status: 'connecting' | 'live' | 'reconnecting' | 'error';
  message?: string;
  code?: string;
}
