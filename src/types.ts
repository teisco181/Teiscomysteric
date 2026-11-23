export const FP_COLS = 16;
export const FP_ROWS = 20;
export const FP_LENGTH = FP_COLS * FP_ROWS;

export const MAP_COLS = 24;
export const MAP_ROWS = 14;

export type UserRole = 'admin' | 'player';

export interface AuthUser {
  id: string;
  username: string;
  role: UserRole;
  createdAt: string;
}

export interface AuthStatus {
  adminClaimed: boolean;
  hasEnvAdminPasscode: boolean;
}

export type TerrainType =
  | 'grass'
  | 'road'
  | 'water'
  | 'cobble'
  | 'forest'
  | 'bridge'
  | 'plaza';

export type LocationCategory =
  | 'house'
  | 'police'
  | 'shop'
  | 'harbor'
  | 'tavern'
  | 'landmark'
  | 'alley';

export interface MapLocation {
  id: string;
  code: string;
  name: string;
  category: LocationCategory;
  x: number;
  y: number;
  width: number;
  height: number;
  address: string;
  description: string;
  publicNote: string;
  visibleToPlayers: boolean;
}

export type PersonStatus = 'verdachte' | 'getuige' | 'slachtoffer' | 'burger';
export type FingerprintPattern = 'Kring' | 'Lus' | 'Boog' | 'Samengesteld';

export interface Person {
  id: string;
  code: string;
  name: string;
  alias: string;
  age: number;
  occupation: string;
  address: string;
  locationId: string;
  portraitUrl: string;
  status: PersonStatus;
  alibi: string;
  publicBio: string;
  policeNotes: string;
  fingerprintCode: string;
  fingerprintPattern: FingerprintPattern;
  fingerprint: number[]; // length FP_LENGTH: 0 = empty, 1 = ridge, 2 = faint/scar
  // Creator-only fields (stripped from API responses for players)
  isCulprit?: boolean;
  creatorSecretNote?: string;
}

export type EvidenceCategory =
  | 'voorwerp'
  | 'document'
  | 'digitaal'
  | 'biologisch'
  | 'spoor';

export interface EvidenceStamp {
  id: string;
  label: string;
  personId: string;
  x: number; // percentage 0..100
  y: number; // percentage 0..100
  rotation: number; // degrees -45..45
  smudgeLevel: number; // 0..100
  matrix: number[]; // FP_LENGTH pixel matrix
}

export interface EvidenceItem {
  id: string;
  code: string;
  title: string;
  category: EvidenceCategory;
  locationId: string;
  foundAtLabel: string;
  description: string;
  forensicReport: string;
  imageUrl: string;
  visibleToPlayers: boolean;
  stamps: EvidenceStamp[];
}

export type CaseStatus = 'draft' | 'published';

export interface CaseFile {
  id: string;
  code: string;
  joinCode?: string;
  title: string;
  townName: string;
  subtitle: string;
  briefing: string;
  printedDossierGuide: string;
  status: CaseStatus;
  mapCols: number;
  mapRows: number;
  terrain: TerrainType[];
  locations: MapLocation[];
  persons: Person[];
  evidence: EvidenceItem[];
  updatedAt: string;
  createdAt: string;
}

export type SuspectMark = 'verdacht' | 'neutraal' | 'vrijgepleit';

export interface CustomTrace {
  id: string;
  label: string;
  matrix: number[];
}

export interface PlayerNote {
  caseId: string;
  userId: string;
  generalNotes: string;
  suspectMarks: Record<string, SuspectMark>;
  pinnedClues: string[];
  customTraces: CustomTrace[];
  updatedAt: string;
}

export interface MapTemplate {
  id: string;
  name: string;
  townName: string;
  mapCols: number;
  mapRows: number;
  terrain: TerrainType[];
  locations: MapLocation[];
  createdAt: string;
  updatedAt: string;
}

