import {
  MAP_COLS,
  MAP_ROWS,
  type AuthStatus,
  type AuthUser,
  type CaseFile,
  type MapTemplate,
  type PlayerNote,
  type TerrainType,
  type UserRole,
} from './types.ts';
import {
  createStarterCase,
  createStarterMapTemplate,
} from './utils/starterData.ts';

interface StaticUser {
  id: string;
  username: string;
  normalizedUsername: string;
  passwordHash: string;
  role: UserRole;
  unlockedCaseIds: string[];
  createdAt: string;
}

interface StaticDb {
  adminClaimed: boolean;
  users: StaticUser[];
  cases: CaseFile[];
  notes: PlayerNote[];
  mapTemplates: MapTemplate[];
}

const STORAGE_KEY = 'teiscomysterics_static_db_v1';

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

async function sha256Hex(text: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoded = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Fallback deterministic hash if crypto.subtle is unavailable (e.g. non-HTTPS local preview)
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function readStaticDb(): StaticDb {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StaticDb;
      if (!Array.isArray(parsed.cases) || parsed.cases.length === 0) {
        parsed.cases = [createStarterCase()];
      }
      if (!Array.isArray(parsed.users)) parsed.users = [];
      if (!Array.isArray(parsed.notes)) parsed.notes = [];
      if (!Array.isArray(parsed.mapTemplates) || parsed.mapTemplates.length === 0) {
        parsed.mapTemplates = [createStarterMapTemplate(parsed.cases[0])];
      }
      if (typeof parsed.adminClaimed !== 'boolean') {
        parsed.adminClaimed = parsed.users.some((u) => u.role === 'admin');
      }
      return parsed;
    }
  } catch {
    // Fall back to fresh starter database
  }

  const starter = createStarterCase();
  const initial: StaticDb = {
    adminClaimed: false,
    users: [],
    cases: [starter],
    notes: [],
    mapTemplates: [createStarterMapTemplate(starter)],
  };
  writeStaticDb(initial);
  return initial;
}

function writeStaticDb(db: StaticDb): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // Ignore quota errors
  }
}

function sanitizeUser(u: StaticUser): AuthUser {
  return {
    id: u.id,
    username: u.username,
    role: u.role,
    createdAt: u.createdAt,
  };
}

function sanitizeCaseForPlayer(c: CaseFile): CaseFile {
  return {
    ...c,
    locations: c.locations.filter((l) => l.visibleToPlayers),
    persons: c.persons.map((p) => ({
      ...p,
      isCulprit: false,
      creatorSecretNote: '',
    })),
    evidence: c.evidence.filter((e) => e.visibleToPlayers),
  };
}

function normalizeRedeemInput(rawCode: string): string[] {
  const cleaned = rawCode
    .trim()
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/\s+/g, ' ');
  if (!cleaned) return [];

  const candidates = new Set<string>();
  candidates.add(cleaned.toUpperCase());

  const strippedLabel = cleaned
    .replace(
      /^(online\s*toegangscode|toegangscode|dossiercode|dossiernummer|spelcode|zaakcode|code)\s*[:=\-]?\s*/i,
      ''
    )
    .trim();
  if (strippedLabel) {
    candidates.add(strippedLabel.toUpperCase());
    const leadingPart = strippedLabel.split(/\s*[·|—–]\s*|\s+/)[0]?.trim();
    if (leadingPart) {
      candidates.add(leadingPart.toUpperCase());
    }
  }

  const compact = cleaned.replace(/\s+/g, '').toUpperCase();
  if (compact) candidates.add(compact);

  return Array.from(candidates);
}

function getSessionUser(db: StaticDb, token: string): StaticUser {
  const userId = token.replace(/^static:/, '');
  const found = db.users.find((u) => u.id === userId);
  if (!found) {
    throw new Error('Niet ingelogd of ongeldige sessie.');
  }
  return found;
}

function requireAdminUser(db: StaticDb, token: string): StaticUser {
  const user = getSessionUser(db, token);
  if (user.role !== 'admin') {
    throw new Error('Alleen de beheerder heeft toegang tot deze actie.');
  }
  return user;
}

export const staticStore = {
  getAuthStatus(): AuthStatus {
    const db = readStaticDb();
    return {
      adminClaimed: db.adminClaimed,
      hasEnvAdminPasscode: false,
    };
  },

  async claimAdmin(
    username: string,
    password: string
  ): Promise<{ user: AuthUser; token: string }> {
    const db = readStaticDb();
    if (db.adminClaimed) {
      throw new Error('Er is al een beheerder ingesteld. Log in met je wachtwoord.');
    }
    const cleanUsername = username.trim();
    const norm = cleanUsername.toLowerCase();
    if (cleanUsername.length < 3 || cleanUsername.length > 32) {
      throw new Error('Gebruikersnaam moet 3 tot 32 tekens bevatten.');
    }
    if (password.length < 6) {
      throw new Error('Wachtwoord moet minimaal 6 tekens bevatten.');
    }
    if (db.users.some((u) => u.normalizedUsername === norm)) {
      throw new Error('Deze gebruikersnaam bestaat al.');
    }

    const user: StaticUser = {
      id: createId('usr'),
      username: cleanUsername,
      normalizedUsername: norm,
      passwordHash: await sha256Hex(`${norm}:${password}`),
      role: 'admin',
      unlockedCaseIds: [],
      createdAt: new Date().toISOString(),
    };
    db.adminClaimed = true;
    db.users.push(user);
    writeStaticDb(db);
    return { user: sanitizeUser(user), token: `static:${user.id}` };
  },

  async register(
    username: string,
    password: string
  ): Promise<{ user: AuthUser; token: string }> {
    const db = readStaticDb();
    const cleanUsername = username.trim();
    const norm = cleanUsername.toLowerCase();
    if (cleanUsername.length < 3 || cleanUsername.length > 32) {
      throw new Error('Gebruikersnaam moet 3 tot 32 tekens bevatten.');
    }
    if (password.length < 6) {
      throw new Error('Wachtwoord moet minimaal 6 tekens bevatten.');
    }
    if (db.users.some((u) => u.normalizedUsername === norm)) {
      throw new Error('Deze gebruikersnaam is al in gebruik.');
    }

    const user: StaticUser = {
      id: createId('usr'),
      username: cleanUsername,
      normalizedUsername: norm,
      passwordHash: await sha256Hex(`${norm}:${password}`),
      role: 'player',
      unlockedCaseIds: [],
      createdAt: new Date().toISOString(),
    };
    db.users.push(user);
    writeStaticDb(db);
    return { user: sanitizeUser(user), token: `static:${user.id}` };
  },

  async login(
    username: string,
    password: string
  ): Promise<{ user: AuthUser; token: string }> {
    const db = readStaticDb();
    const norm = username.trim().toLowerCase();
    const user = db.users.find((u) => u.normalizedUsername === norm);
    const hash = await sha256Hex(`${norm}:${password}`);
    if (!user || user.passwordHash !== hash) {
      throw new Error('Ongeldige gebruikersnaam of wachtwoord.');
    }
    return { user: sanitizeUser(user), token: `static:${user.id}` };
  },

  listCases(token: string): { cases: CaseFile[] } {
    const db = readStaticDb();
    const user = getSessionUser(db, token);
    if (user.role === 'admin') {
      return { cases: db.cases };
    }
    const unlocked = new Set(user.unlockedCaseIds ?? []);
    return {
      cases: db.cases
        .filter((c) => c.status === 'published' && unlocked.has(c.id))
        .map(sanitizeCaseForPlayer),
    };
  },

  redeemCaseCode(
    token: string,
    rawCode: string
  ): { caseFile: CaseFile; alreadyUnlocked: boolean } {
    const db = readStaticDb();
    const user = getSessionUser(db, token);
    const candidates = normalizeRedeemInput(rawCode);
    if (candidates.length === 0) {
      throw new Error('Vul een geldige dossiercode in.');
    }

    const matchKey = (c: CaseFile): boolean => {
      const keys = [c.joinCode, c.code, c.id]
        .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
        .map((v) => v.trim().replace(/[\u2010-\u2015\u2212]/g, '-').toUpperCase());
      return candidates.some((cand) => keys.includes(cand));
    };

    const matchedAny = db.cases.find(matchKey);
    if (!matchedAny) {
      throw new Error('Geen dossier gevonden met deze code. Controleer de code in je dossier.');
    }
    if (user.role !== 'admin' && matchedAny.status !== 'published') {
      throw new Error(
        'Dit dossier staat nog op Concept. Zet de status in de Bouwer Versie op Gepubliceerd en sla het dossier op.'
      );
    }

    if (!Array.isArray(user.unlockedCaseIds)) {
      user.unlockedCaseIds = [];
    }
    const alreadyUnlocked = user.unlockedCaseIds.includes(matchedAny.id);
    if (!alreadyUnlocked) {
      user.unlockedCaseIds.push(matchedAny.id);
      writeStaticDb(db);
    }

    return {
      caseFile: user.role === 'admin' ? matchedAny : sanitizeCaseForPlayer(matchedAny),
      alreadyUnlocked,
    };
  },

  createCase(token: string, payload: Partial<CaseFile>): { caseFile: CaseFile } {
    const db = readStaticDb();
    requireAdminUser(db, token);
    const now = new Date().toISOString();
    const cols =
      typeof payload.mapCols === 'number' && payload.mapCols >= 8 && payload.mapCols <= 48
        ? Math.floor(payload.mapCols)
        : MAP_COLS;
    const rows =
      typeof payload.mapRows === 'number' && payload.mapRows >= 6 && payload.mapRows <= 36
        ? Math.floor(payload.mapRows)
        : MAP_ROWS;
    const terrain: TerrainType[] =
      Array.isArray(payload.terrain) && payload.terrain.length === cols * rows
        ? payload.terrain
        : new Array<TerrainType>(cols * rows).fill('grass');

    const defaultCode = `ZAAK-${String(db.cases.length + 47).padStart(3, '0')}`;
    const caseCode = payload.code?.trim() || defaultCode;
    const created: CaseFile = {
      id: createId('case'),
      code: caseCode,
      joinCode: payload.joinCode?.trim() || caseCode,
      title: payload.title?.trim() || 'Nieuw Mysterie Dossier',
      townName: payload.townName?.trim() || 'Nieuw Dorp',
      subtitle: payload.subtitle?.trim() || 'Onderzoek in voorbereiding',
      status: payload.status ?? 'published',
      briefing: payload.briefing ?? 'Vul hier de zaakomschrijving in voor het papieren dossier.',
      printedDossierGuide:
        payload.printedDossierGuide ??
        'Vergelijk de sporen uit het fysieke dossier in het online politiesysteem.',
      mapCols: cols,
      mapRows: rows,
      terrain,
      locations: Array.isArray(payload.locations) ? payload.locations : [],
      persons: Array.isArray(payload.persons) ? payload.persons : [],
      evidence: Array.isArray(payload.evidence) ? payload.evidence : [],
      createdAt: now,
      updatedAt: now,
    };
    db.cases.push(created);
    writeStaticDb(db);
    return { caseFile: created };
  },

  updateCase(token: string, caseId: string, payload: CaseFile): { caseFile: CaseFile } {
    const db = readStaticDb();
    requireAdminUser(db, token);
    const idx = db.cases.findIndex((c) => c.id === caseId);
    if (idx === -1) {
      throw new Error('Dossier niet gevonden.');
    }
    const existing = db.cases[idx];
    const updated: CaseFile = {
      ...payload,
      id: existing.id,
      joinCode: (payload.joinCode ?? payload.code ?? existing.joinCode ?? existing.code).trim(),
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    db.cases[idx] = updated;
    writeStaticDb(db);
    return { caseFile: updated };
  },

  deleteCase(token: string, caseId: string): { deleted: boolean } {
    const db = readStaticDb();
    requireAdminUser(db, token);
    const before = db.cases.length;
    db.cases = db.cases.filter((c) => c.id !== caseId);
    if (db.cases.length === before) {
      throw new Error('Dossier niet gevonden.');
    }
    db.notes = db.notes.filter((n) => n.caseId !== caseId);
    writeStaticDb(db);
    return { deleted: true };
  },

  getNotes(token: string, caseId: string): { note: PlayerNote } {
    const db = readStaticDb();
    const user = getSessionUser(db, token);
    const existing = db.notes.find(
      (n) => n.caseId === caseId && n.userId === user.id
    );
    if (existing) {
      return { note: existing };
    }
    return {
      note: {
        caseId,
        userId: user.id,
        generalNotes: '',
        suspectMarks: {},
        pinnedClues: [],
        customTraces: [],
        updatedAt: new Date().toISOString(),
      },
    };
  },

  saveNotes(
    token: string,
    caseId: string,
    payload: Partial<PlayerNote>
  ): { note: PlayerNote } {
    const db = readStaticDb();
    const user = getSessionUser(db, token);
    const now = new Date().toISOString();
    const idx = db.notes.findIndex(
      (n) => n.caseId === caseId && n.userId === user.id
    );
    const next: PlayerNote = {
      caseId,
      userId: user.id,
      generalNotes: typeof payload.generalNotes === 'string' ? payload.generalNotes : '',
      suspectMarks: payload.suspectMarks ?? {},
      pinnedClues: Array.isArray(payload.pinnedClues) ? payload.pinnedClues : [],
      customTraces: Array.isArray(payload.customTraces) ? payload.customTraces : [],
      updatedAt: now,
    };
    if (idx === -1) {
      db.notes.push(next);
    } else {
      db.notes[idx] = next;
    }
    writeStaticDb(db);
    return { note: next };
  },

  listMaps(token: string): { maps: MapTemplate[] } {
    const db = readStaticDb();
    requireAdminUser(db, token);
    return { maps: db.mapTemplates };
  },

  createMap(token: string, payload: Partial<MapTemplate>): { mapTemplate: MapTemplate } {
    const db = readStaticDb();
    requireAdminUser(db, token);
    const now = new Date().toISOString();
    const cols =
      typeof payload.mapCols === 'number' && payload.mapCols >= 8 && payload.mapCols <= 48
        ? Math.floor(payload.mapCols)
        : MAP_COLS;
    const rows =
      typeof payload.mapRows === 'number' && payload.mapRows >= 6 && payload.mapRows <= 36
        ? Math.floor(payload.mapRows)
        : MAP_ROWS;
    const terrain: TerrainType[] =
      Array.isArray(payload.terrain) && payload.terrain.length === cols * rows
        ? [...payload.terrain]
        : new Array<TerrainType>(cols * rows).fill('grass');

    const created: MapTemplate = {
      id: createId('map'),
      name: payload.name?.trim() || `Dorp ${db.mapTemplates.length + 1}`,
      townName: payload.townName?.trim() || 'Nieuw Dorp',
      mapCols: cols,
      mapRows: rows,
      terrain,
      locations: Array.isArray(payload.locations)
        ? payload.locations.map((loc) => ({ ...loc }))
        : [],
      createdAt: now,
      updatedAt: now,
    };
    db.mapTemplates.push(created);
    writeStaticDb(db);
    return { mapTemplate: created };
  },

  updateMap(
    token: string,
    mapId: string,
    payload: Partial<MapTemplate>
  ): { mapTemplate: MapTemplate } {
    const db = readStaticDb();
    requireAdminUser(db, token);
    const idx = db.mapTemplates.findIndex((m) => m.id === mapId);
    if (idx === -1) {
      throw new Error('Kaart niet gevonden.');
    }
    const existing = db.mapTemplates[idx];
    const cols =
      typeof payload.mapCols === 'number' && payload.mapCols >= 8 && payload.mapCols <= 48
        ? Math.floor(payload.mapCols)
        : existing.mapCols;
    const rows =
      typeof payload.mapRows === 'number' && payload.mapRows >= 6 && payload.mapRows <= 36
        ? Math.floor(payload.mapRows)
        : existing.mapRows;
    const terrain =
      Array.isArray(payload.terrain) && payload.terrain.length === cols * rows
        ? [...payload.terrain]
        : existing.terrain;

    const updated: MapTemplate = {
      ...existing,
      name: payload.name?.trim() || existing.name,
      townName: payload.townName?.trim() || existing.townName,
      mapCols: cols,
      mapRows: rows,
      terrain,
      locations: Array.isArray(payload.locations)
        ? payload.locations.map((loc) => ({ ...loc }))
        : existing.locations,
      updatedAt: new Date().toISOString(),
    };
    db.mapTemplates[idx] = updated;
    writeStaticDb(db);
    return { mapTemplate: updated };
  },

  deleteMap(token: string, mapId: string): { deleted: boolean } {
    const db = readStaticDb();
    requireAdminUser(db, token);
    const before = db.mapTemplates.length;
    db.mapTemplates = db.mapTemplates.filter((m) => m.id !== mapId);
    if (db.mapTemplates.length === before) {
      throw new Error('Kaart niet gevonden.');
    }
    writeStaticDb(db);
    return { deleted: true };
  },
};
