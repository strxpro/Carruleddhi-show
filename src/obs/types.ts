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
  sponsors_enabled: boolean;
  sponsors: Sponsor[];
  updated_at: string;
}

export interface BroadcastConnection {
  status: 'connecting' | 'live' | 'reconnecting' | 'error';
  message?: string;
  code?: string;
}
