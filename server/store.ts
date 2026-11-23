import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  AuthUser,
  CaseFile,
  PlayerNote,
  TerrainType,
  UserRole,
} from '../src/types.ts';
import { createStarterCase } from './seed.ts';

interface StoredUser {
  id: string;
  username: string;
  normalizedUsername: string;
  passwordHash: string; // salt:scryptHex
  role: UserRole;
  unlockedCaseIds: string[];
  createdAt: string;
}

interface DatabaseSchema {
  adminClaimed: boolean;
  users: StoredUser[];
  cases: CaseFile[];
  notes: PlayerNote[];
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'teiscomysterics.json');

// Ephemeral fallback secret if SESSION_SECRET is not provided in environment
const SESSION_SECRET =
  process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16
    ? process.env.SESSION_SECRET
    : crypto.randomBytes(32).toString('hex');

function ensureDb(): DatabaseSchema {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_PATH)) {
    const initial: DatabaseSchema = {
      adminClaimed: false,
      users: [],
      cases: [createStarterCase()],
      notes: [],
    };
    writeDbAtomic(initial);
    return initial;
  }
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    const parsed = JSON.parse(raw) as DatabaseSchema;
    if (!Array.isArray(parsed.cases) || parsed.cases.length === 0) {
      parsed.cases = [createStarterCase()];
    }
    if (!Array.isArray(parsed.users)) parsed.users = [];
    if (!Array.isArray(parsed.notes)) parsed.notes = [];
    if (typeof parsed.adminClaimed !== 'boolean') {
      parsed.adminClaimed = parsed.users.some((u) => u.role === 'admin');
    }
    return parsed;
  } catch {
    const fallback: DatabaseSchema = {
      adminClaimed: false,
      users: [],
      cases: [createStarterCase()],
      notes: [],
    };
    writeDbAtomic(fallback);
    return fallback;
  }
}

function writeDbAtomic(data: DatabaseSchema): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpPath = `${DB_PATH}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpPath, DB_PATH);
}

let dbCache: DatabaseSchema | null = null;

function getDb(): DatabaseSchema {
  if (!dbCache) {
    dbCache = ensureDb();
  }
  return dbCache;
}

function persistDb(): void {
  if (dbCache) {
    writeDbAtomic(dbCache);
  }
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 2) return false;
  const [salt, hashHex] = parts;
  if (!salt || !hashHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hashHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

function safeCompareSecret(input: string, envSecret: string): boolean {
  const a = crypto.createHash('sha256').update(input).digest();
  const b = crypto.createHash('sha256').update(envSecret).digest();
  return crypto.timingSafeEqual(a, b);
}

export function createAuthToken(user: AuthUser): string {
  const payload = {
    sub: user.id,
    username: user.username,
    role: user.role,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 7, // 7 days
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payloadB64)
    .digest('base64url');
  return `${payloadB64}.${sig}`;
}

export function verifyAuthToken(token: string): AuthUser | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;
  if (!payloadB64 || !sig) return null;

  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payloadB64)
    .digest('base64url');

  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf8')
    ) as { sub: string; username: string; role: UserRole; exp: number };

    if (!parsed.sub || !parsed.username || !parsed.role || parsed.exp < Date.now()) {
      return null;
    }

    return {
      id: parsed.sub,
      username: parsed.username,
      role: parsed.role,
      createdAt: '',
    };
  } catch {
    return null;
  }
}

export function getAuthStatus(): { adminClaimed: boolean; hasEnvAdminPasscode: boolean } {
  const db = getDb();
  const envPasscode = (process.env.ADMIN_PASSCODE ?? '').trim();
  return {
    adminClaimed: db.adminClaimed,
    hasEnvAdminPasscode: envPasscode.length > 0,
  };
}

export function claimAdminAccount(
  username: string,
  password: string
): { ok: true; user: AuthUser; token: string } | { ok: false; error: string; status: number } {
  const db = getDb();
  const envPasscode = (process.env.ADMIN_PASSCODE ?? '').trim();
  if (envPasscode.length > 0 || db.adminClaimed) {
    return {
      ok: false,
      error: 'Beheerder-account is al geclaimd of vastgelegd via serverconfiguratie.',
      status: 403,
    };
  }

  const cleanUsername = username.trim();
  if (cleanUsername.length < 3 || cleanUsername.length > 32) {
    return { ok: false, error: 'Gebruikersnaam moet 3 tot 32 tekens bevatten.', status: 400 };
  }
  if (password.length < 6) {
    return { ok: false, error: 'Wachtwoord moet minimaal 6 tekens bevatten.', status: 400 };
  }

  const normalized = cleanUsername.toLowerCase();
  if (db.users.some((u) => u.normalizedUsername === normalized)) {
    return { ok: false, error: 'Deze gebruikersnaam is al in gebruik.', status: 409 };
  }

  const newUser: StoredUser = {
    id: `usr-${crypto.randomUUID()}`,
    username: cleanUsername,
    normalizedUsername: normalized,
    passwordHash: hashPassword(password),
    role: 'admin',
    unlockedCaseIds: [],
    createdAt: new Date().toISOString(),
  };

  db.users.push(newUser);
  db.adminClaimed = true;
  persistDb();

  const publicUser: AuthUser = {
    id: newUser.id,
    username: newUser.username,
    role: newUser.role,
    createdAt: newUser.createdAt,
  };
  return { ok: true, user: publicUser, token: createAuthToken(publicUser) };
}

export function registerPlayerAccount(
  username: string,
  password: string
): { ok: true; user: AuthUser; token: string } | { ok: false; error: string; status: number } {
  const db = getDb();
  const cleanUsername = username.trim();
  if (cleanUsername.length < 3 || cleanUsername.length > 32) {
    return { ok: false, error: 'Gebruikersnaam moet 3 tot 32 tekens bevatten.', status: 400 };
  }
  if (!/^[a-zA-Z0-9_.-]+$/.test(cleanUsername)) {
    return {
      ok: false,
      error: 'Gebruikersnaam mag alleen letters, cijfers, punt, liggend streepje of koppelteken bevatten.',
      status: 400,
    };
  }
  if (password.length < 6) {
    return { ok: false, error: 'Wachtwoord moet minimaal 6 tekens bevatten.', status: 400 };
  }

  const normalized = cleanUsername.toLowerCase();
  if (normalized === 'admin' || db.users.some((u) => u.normalizedUsername === normalized)) {
    return { ok: false, error: 'Deze gebruikersnaam is al bezet.', status: 409 };
  }

  const newUser: StoredUser = {
    id: `usr-${crypto.randomUUID()}`,
    username: cleanUsername,
    normalizedUsername: normalized,
    passwordHash: hashPassword(password),
    role: 'player',
    unlockedCaseIds: [],
    createdAt: new Date().toISOString(),
  };

  db.users.push(newUser);
  persistDb();

  const publicUser: AuthUser = {
    id: newUser.id,
    username: newUser.username,
    role: newUser.role,
    createdAt: newUser.createdAt,
  };
  return { ok: true, user: publicUser, token: createAuthToken(publicUser) };
}

export function loginUser(
  username: string,
  password: string
): { ok: true; user: AuthUser; token: string } | { ok: false; error: string; status: number } {
  const db = getDb();
  const cleanUsername = username.trim();
  const normalized = cleanUsername.toLowerCase();
  const envPasscode = (process.env.ADMIN_PASSCODE ?? '').trim();

  // Configured server ADMIN_PASSCODE overrides any claimed fallback hash
  if (envPasscode.length > 0 && normalized === 'admin') {
    if (safeCompareSecret(password, envPasscode)) {
      const envAdmin: AuthUser = {
        id: 'usr-env-admin',
        username: 'admin',
        role: 'admin',
        createdAt: '',
      };
      return { ok: true, user: envAdmin, token: createAuthToken(envAdmin) };
    }
    return { ok: false, error: 'Ongeldige gebruikersnaam of wachtwoord.', status: 401 };
  }

  const found = db.users.find((u) => u.normalizedUsername === normalized);
  if (!found || !verifyPassword(password, found.passwordHash)) {
    return { ok: false, error: 'Ongeldige gebruikersnaam of wachtwoord.', status: 401 };
  }

  // If ADMIN_PASSCODE is configured, prevent non-env admin login override
  if (envPasscode.length > 0 && found.role === 'admin') {
    if (!safeCompareSecret(password, envPasscode)) {
      return { ok: false, error: 'Gebruik de ingestelde beheerderstoegangscode.', status: 401 };
    }
  }

  const publicUser: AuthUser = {
    id: found.id,
    username: found.username,
    role: found.role,
    createdAt: found.createdAt,
  };
  return { ok: true, user: publicUser, token: createAuthToken(publicUser) };
}

function sanitizeCaseForPlayer(caseFile: CaseFile): CaseFile {
  return {
    ...caseFile,
    locations: caseFile.locations.filter((loc) => loc.visibleToPlayers),
    persons: caseFile.persons.map((p) => ({
      ...p,
      isCulprit: undefined,
      creatorSecretNote: undefined,
    })),
    evidence: caseFile.evidence.filter((ev) => ev.visibleToPlayers),
  };
}

export function listCasesForUser(role: UserRole, userId: string): CaseFile[] {
  const db = getDb();
  if (role === 'admin') {
    return db.cases;
  }
  const user = db.users.find((u) => u.id === userId);
  const unlocked = new Set(user?.unlockedCaseIds ?? []);
  return db.cases
    .filter((c) => c.status === 'published' && unlocked.has(c.id))
    .map(sanitizeCaseForPlayer);
}

export function getCaseForUser(
  caseId: string,
  role: UserRole,
  userId: string
): CaseFile | null {
  const db = getDb();
  const found = db.cases.find((c) => c.id === caseId);
  if (!found) return null;
  if (role === 'admin') return found;
  if (found.status !== 'published') return null;
  const user = db.users.find((u) => u.id === userId);
  if (!user || !(user.unlockedCaseIds ?? []).includes(found.id)) {
    return null;
  }
  return sanitizeCaseForPlayer(found);
}

export function redeemCaseCode(
  userId: string,
  rawCode: string
):
  | { ok: true; caseFile: CaseFile; alreadyUnlocked: boolean }
  | { ok: false; error: string; status: number } {
  const db = getDb();
  const normalizedCode = rawCode.trim().toUpperCase();
  if (!normalizedCode) {
    return { ok: false, error: 'Voer een geldige dossiercode in.', status: 400 };
  }

  const found = db.cases.find((c) => {
    if (c.status !== 'published') return false;
    const primary = (c.joinCode || c.code).trim().toUpperCase();
    const fallback = c.code.trim().toUpperCase();
    return primary === normalizedCode || fallback === normalizedCode;
  });

  if (!found) {
    return {
      ok: false,
      error: 'Geen actief mysterie gevonden met deze code.',
      status: 404,
    };
  }

  const user = db.users.find((u) => u.id === userId);
  if (!user) {
    return { ok: false, error: 'Gebruiker niet gevonden.', status: 404 };
  }

  if (!Array.isArray(user.unlockedCaseIds)) {
    user.unlockedCaseIds = [];
  }

  const alreadyUnlocked = user.unlockedCaseIds.includes(found.id);
  if (!alreadyUnlocked) {
    user.unlockedCaseIds.push(found.id);
    persistDb();
  }

  return {
    ok: true,
    caseFile: sanitizeCaseForPlayer(found),
    alreadyUnlocked,
  };
}

export function createCase(input: Partial<CaseFile>): CaseFile {
  const db = getDb();
  const now = new Date().toISOString();
  const mapCols =
    typeof input.mapCols === 'number'
      ? Math.max(8, Math.min(48, Math.round(input.mapCols)))
      : 24;
  const mapRows =
    typeof input.mapRows === 'number'
      ? Math.max(6, Math.min(36, Math.round(input.mapRows)))
      : 14;
  const terrain: TerrainType[] =
    Array.isArray(input.terrain) && input.terrain.length === mapCols * mapRows
      ? input.terrain
      : new Array<TerrainType>(mapCols * mapRows).fill('grass');

  const code = (
    input.code ?? `ZAAK-${String(db.cases.length + 48).padStart(3, '0')}`
  ).slice(0, 24);
  const joinCode = (input.joinCode ?? code).trim().toUpperCase().slice(0, 24);

  const newCase: CaseFile = {
    id: `case-${crypto.randomUUID().slice(0, 8)}`,
    code,
    joinCode,
    title: (input.title ?? 'Nieuw Politiedossier').slice(0, 120),
    townName: (input.townName ?? 'Nieuw Dorp').slice(0, 80),
    subtitle: (input.subtitle ?? 'Mysterie in onderzoek').slice(0, 140),
    briefing: (input.briefing ?? '').slice(0, 4000),
    printedDossierGuide: (input.printedDossierGuide ?? '').slice(0, 2000),
    status: input.status === 'published' ? 'published' : 'draft',
    mapCols,
    mapRows,
    terrain,
    locations: Array.isArray(input.locations) ? input.locations : [],
    persons: Array.isArray(input.persons) ? input.persons : [],
    evidence: Array.isArray(input.evidence) ? input.evidence : [],
    createdAt: now,
    updatedAt: now,
  };

  db.cases.push(newCase);
  persistDb();
  return newCase;
}

export function updateCase(caseId: string, patch: CaseFile): CaseFile | null {
  const db = getDb();
  const idx = db.cases.findIndex((c) => c.id === caseId);
  if (idx === -1) return null;

  const existing = db.cases[idx];
  const mapCols =
    typeof patch.mapCols === 'number'
      ? Math.max(8, Math.min(48, Math.round(patch.mapCols)))
      : existing.mapCols;
  const mapRows =
    typeof patch.mapRows === 'number'
      ? Math.max(6, Math.min(36, Math.round(patch.mapRows)))
      : existing.mapRows;

  const updated: CaseFile = {
    ...existing,
    ...patch,
    mapCols,
    mapRows,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };

  db.cases[idx] = updated;
  persistDb();
  return updated;
}

export function deleteCase(caseId: string): boolean {
  const db = getDb();
  const before = db.cases.length;
  db.cases = db.cases.filter((c) => c.id !== caseId);
  if (db.cases.length === before) return false;
  db.notes = db.notes.filter((n) => n.caseId !== caseId);
  persistDb();
  return true;
}

export function getPlayerNote(caseId: string, userId: string): PlayerNote {
  const db = getDb();
  const existing = db.notes.find((n) => n.caseId === caseId && n.userId === userId);
  if (existing) return existing;
  return {
    caseId,
    userId,
    generalNotes: '',
    suspectMarks: {},
    pinnedClues: [],
    customTraces: [],
    updatedAt: new Date().toISOString(),
  };
}

export function savePlayerNote(
  caseId: string,
  userId: string,
  payload: Partial<PlayerNote>
): PlayerNote {
  const db = getDb();
  const idx = db.notes.findIndex((n) => n.caseId === caseId && n.userId === userId);
  const next: PlayerNote = {
    caseId,
    userId,
    generalNotes: typeof payload.generalNotes === 'string' ? payload.generalNotes.slice(0, 12000) : '',
    suspectMarks: payload.suspectMarks && typeof payload.suspectMarks === 'object' ? payload.suspectMarks : {},
    pinnedClues: Array.isArray(payload.pinnedClues) ? payload.pinnedClues.slice(0, 50) : [],
    customTraces: Array.isArray(payload.customTraces) ? payload.customTraces.slice(0, 20) : [],
    updatedAt: new Date().toISOString(),
  };

  if (idx === -1) {
    db.notes.push(next);
  } else {
    db.notes[idx] = next;
  }
  persistDb();
  return next;
}
