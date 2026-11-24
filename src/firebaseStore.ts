import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  linkWithCredential,
  reauthenticateWithPopup,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from './firebase.ts';
import {
  MAP_COLS,
  MAP_ROWS,
  type AuthUser,
  type CaseFile,
  type CommunityTemplate,
  type MapLocation,
  type MapTemplate,
  type PlayerNote,
  type TerrainType,
  type UserRole,
} from './types.ts';
import {
  createStarterCase,
  createStarterCommunity,
  createStarterMapTemplate,
} from './utils/starterData.ts';

const BOOTSTRAP_ADMIN_EMAIL = 'teisco181@gmail.com';
const FIRESTORE_OP_TIMEOUT_MS = 12000;

function withTimeout<T>(promise: Promise<T>, label: string, ms = FIRESTORE_OP_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = globalThis.setTimeout(() => {
      reject(
        new Error(
          `Verbinding met de database duurde te lang (${label}). Controleer je internetverbinding en probeer opnieuw.`
        )
      );
    }, ms);
    promise.then(
      (val) => {
        globalThis.clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        globalThis.clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function toIso(val: unknown): string {
  if (val instanceof Timestamp) {
    return val.toDate().toISOString();
  }
  if (typeof val === 'string' && val.length > 0) {
    return val;
  }
  return new Date().toISOString();
}

function clampStr(val: unknown, maxLen: number, fallback = ''): string {
  const s = typeof val === 'string' ? val : fallback;
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function sanitizeId(raw: string, fallbackPrefix = 'id'): string {
  const cleaned = raw
    .trim()
    .replace(/[^a-zA-Z0-9_\-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 128);
  return cleaned.length > 0 ? cleaned : `${fallbackPrefix}-${Date.now().toString(36)}`;
}

function codeLookupId(rawCode: string): string {
  return rawCode
    .trim()
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .toUpperCase()
    .replace(/[^A-Z0-9_\-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 128);
}

function normalizeRedeemInput(rawCode: string): string[] {
  const cleaned = rawCode
    .trim()
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/\s+/g, ' ');
  if (!cleaned) return [];

  const candidates = new Set<string>();
  const add = (val: string) => {
    const id = codeLookupId(val);
    if (id.length > 0) candidates.add(id);
  };

  add(cleaned);

  const strippedLabel = cleaned
    .replace(
      /^(online\s*toegangscode|toegangscode|dossiercode|dossiernummer|spelcode|zaakcode|code)\s*[:=\-]?\s*/i,
      ''
    )
    .trim();
  if (strippedLabel) {
    add(strippedLabel);
    const leadingPart = strippedLabel.split(/\s*[·|—–]\s*|\s+/)[0]?.trim();
    if (leadingPart) add(leadingPart);
  }

  const compact = cleaned.replace(/\s+/g, '');
  if (compact) add(compact);

  return Array.from(candidates);
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

function serializeLocations(locations: unknown): MapLocation[] {
  if (!Array.isArray(locations)) return [];
  return locations.slice(0, 100).map((raw) => {
    const loc = (raw ?? {}) as MapLocation;
    const base: MapLocation = {
      id: String(loc.id ?? `loc-${Date.now().toString(36)}`),
      code: clampStr(loc.code ?? 'LOC-01', 32),
      name: clampStr(loc.name ?? 'Locatie', 140),
      category: loc.category ?? 'house',
      x: Math.max(0, Math.floor(Number(loc.x ?? 0))),
      y: Math.max(0, Math.floor(Number(loc.y ?? 0))),
      width: Math.max(1, Math.floor(Number(loc.width ?? 1))),
      height: Math.max(1, Math.floor(Number(loc.height ?? 1))),
      address: clampStr(loc.address ?? '', 200),
      description: clampStr(loc.description ?? '', 2000),
      publicNote: clampStr(loc.publicNote ?? '', 2000),
      visibleToPlayers: loc.visibleToPlayers !== false,
    };
    if (loc.kind === 'zone' || loc.kind === 'building') {
      base.kind = loc.kind;
    }
    if (loc.zoneColor) {
      base.zoneColor = loc.zoneColor;
    }
    if (Array.isArray(loc.cells) && loc.cells.length > 0) {
      const seen = new Set<string>();
      const cleanCells: { x: number; y: number }[] = [];
      for (const cell of loc.cells) {
        if (!cell || typeof cell !== 'object') continue;
        const cx = Math.max(0, Math.min(47, Math.floor(Number(cell.x ?? 0))));
        const cy = Math.max(0, Math.min(35, Math.floor(Number(cell.y ?? 0))));
        const key = `${cx},${cy}`;
        if (!seen.has(key)) {
          seen.add(key);
          cleanCells.push({ x: cx, y: cy });
        }
        if (cleanCells.length >= 1728) break;
      }
      if (cleanCells.length > 0) {
        base.cells = cleanCells;
        const xs = cleanCells.map((c) => c.x);
        const ys = cleanCells.map((c) => c.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        base.x = minX;
        base.y = minY;
        base.width = Math.max(1, maxX - minX + 1);
        base.height = Math.max(1, maxY - minY + 1);
      }
    }
    return base;
  });
}

function serializeCaseDoc(
  caseFile: CaseFile,
  ownerId: string,
  existingCreatedAt?: unknown
): Record<string, unknown> {
  const code = clampStr(caseFile.code.trim() || 'ZAAK-001', 64);
  const joinCode = clampStr((caseFile.joinCode ?? caseFile.code).trim() || code, 64);
  return {
    id: sanitizeId(caseFile.id, 'case'),
    ownerId: sanitizeId(ownerId, 'uid'),
    code,
    joinCode,
    title: clampStr(caseFile.title.trim() || 'Nieuw Mysterie Dossier', 140),
    townName: clampStr(caseFile.townName.trim() || 'Nieuw Dorp', 100),
    subtitle: clampStr(caseFile.subtitle ?? '', 200),
    status: caseFile.status === 'published' ? 'published' : 'draft',
    briefing: clampStr(caseFile.briefing ?? '', 15000),
    printedDossierGuide: clampStr(caseFile.printedDossierGuide ?? '', 5000),
    mapCols: Math.max(8, Math.min(48, Math.floor(caseFile.mapCols || MAP_COLS))),
    mapRows: Math.max(6, Math.min(36, Math.floor(caseFile.mapRows || MAP_ROWS))),
    terrain: Array.isArray(caseFile.terrain) ? caseFile.terrain.slice(0, 1728) : [],
    locations: serializeLocations(caseFile.locations),
    persons: Array.isArray(caseFile.persons) ? caseFile.persons.slice(0, 60) : [],
    evidence: Array.isArray(caseFile.evidence) ? caseFile.evidence.slice(0, 100) : [],
    createdAt: existingCreatedAt ?? serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

function hydrateCase(id: string, data: Record<string, unknown>): CaseFile {
  return {
    id,
    code: String(data.code ?? 'ZAAK-001'),
    joinCode: String(data.joinCode ?? data.code ?? 'ZAAK-001'),
    title: String(data.title ?? 'Dossier'),
    townName: String(data.townName ?? 'Dorp'),
    subtitle: String(data.subtitle ?? ''),
    briefing: String(data.briefing ?? ''),
    printedDossierGuide: String(data.printedDossierGuide ?? ''),
    status: data.status === 'published' ? 'published' : 'draft',
    mapCols: Number(data.mapCols ?? MAP_COLS),
    mapRows: Number(data.mapRows ?? MAP_ROWS),
    terrain: Array.isArray(data.terrain) ? (data.terrain as TerrainType[]) : [],
    locations: Array.isArray(data.locations) ? (data.locations as CaseFile['locations']) : [],
    persons: Array.isArray(data.persons) ? (data.persons as CaseFile['persons']) : [],
    evidence: Array.isArray(data.evidence) ? (data.evidence as CaseFile['evidence']) : [],
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}

function hydrateMapTemplate(id: string, data: Record<string, unknown>): MapTemplate {
  return {
    id,
    name: String(data.name ?? 'Kaart'),
    townName: String(data.townName ?? 'Dorp'),
    mapCols: Number(data.mapCols ?? MAP_COLS),
    mapRows: Number(data.mapRows ?? MAP_ROWS),
    terrain: Array.isArray(data.terrain) ? (data.terrain as TerrainType[]) : [],
    locations: Array.isArray(data.locations) ? (data.locations as MapTemplate['locations']) : [],
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}

function hydrateCommunity(id: string, data: Record<string, unknown>): CommunityTemplate {
  return {
    id,
    name: String(data.name ?? 'Community'),
    description: String(data.description ?? ''),
    townName: String(data.townName ?? 'Dorp'),
    mapCols: Number(data.mapCols ?? MAP_COLS),
    mapRows: Number(data.mapRows ?? MAP_ROWS),
    terrain: Array.isArray(data.terrain) ? (data.terrain as TerrainType[]) : [],
    locations: Array.isArray(data.locations) ? (data.locations as CommunityTemplate['locations']) : [],
    persons: Array.isArray(data.persons) ? (data.persons as CommunityTemplate['persons']) : [],
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}

const SYNTHETIC_EMAIL_DOMAIN = 'users.teiscomysterics.app';
let pendingDisplayName: string | null = null;

export function isSyntheticUsernameEmail(email: string | null | undefined): boolean {
  return Boolean(email && email.toLowerCase().endsWith(`@${SYNTHETIC_EMAIL_DOMAIN}`));
}

export function normalizeUsernameToEmail(rawUsername: string): string {
  const clean = rawUsername.trim().toLowerCase();
  if (
    clean.length < 3 ||
    clean.length > 32 ||
    !/^[a-z0-9._-]+$/.test(clean) ||
    clean.startsWith('.') ||
    clean.endsWith('.') ||
    clean.includes('..')
  ) {
    throw new Error(
      'Gebruik 3–32 tekens voor de gebruikersnaam (alleen letters, cijfers, _, - of . zonder dubbele punten).'
    );
  }
  return `${clean}@${SYNTHETIC_EMAIL_DOMAIN}`;
}

export function resolveLoginIdentifier(identifier: string): {
  email: string;
  isUsername: boolean;
} {
  const trimmed = identifier.trim();
  if (!trimmed) {
    throw new Error('Vul een gebruikersnaam of e-mailadres in.');
  }
  if (trimmed.includes('@')) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      throw new Error('Vul een geldig e-mailadres in.');
    }
    return { email: trimmed.toLowerCase(), isUsername: false };
  }
  return { email: normalizeUsernameToEmail(trimmed), isUsername: true };
}

export async function signInWithGoogleAccount(): Promise<FirebaseUser> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signInWithIdentifierAndPassword(
  identifier: string,
  password: string
): Promise<FirebaseUser> {
  if (!password) {
    throw new Error('Vul je wachtwoord in.');
  }
  const { email } = resolveLoginIdentifier(identifier);
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
}

export async function registerWithUsernameAccount(
  username: string,
  password: string
): Promise<FirebaseUser> {
  if (password.length < 6) {
    throw new Error('Het wachtwoord moet minimaal 6 tekens lang zijn.');
  }
  const cleanName = username.trim();
  const email = normalizeUsernameToEmail(cleanName);
  pendingDisplayName = clampStr(cleanName, 80);
  try {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(result.user, { displayName: clampStr(cleanName, 80) }).catch(
      () => undefined
    );
    return result.user;
  } catch (err) {
    pendingDisplayName = null;
    throw err;
  }
}

export async function registerWithEmailAccount(
  email: string,
  password: string,
  displayName?: string
): Promise<FirebaseUser> {
  const trimmedEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    throw new Error('Vul een geldig e-mailadres in.');
  }
  if (password.length < 6) {
    throw new Error('Het wachtwoord moet minimaal 6 tekens lang zijn.');
  }
  const chosenName = clampStr(
    displayName?.trim() || trimmedEmail.split('@')[0] || 'Rechercheur',
    80
  );
  pendingDisplayName = chosenName;
  try {
    const result = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
    await updateProfile(result.user, { displayName: chosenName }).catch(() => undefined);
    void sendEmailVerification(result.user).catch(() => undefined);
    return result.user;
  } catch (err) {
    pendingDisplayName = null;
    throw err;
  }
}

export async function sendResetPasswordForEmail(identifier: string): Promise<void> {
  const trimmed = identifier.trim();
  if (!trimmed.includes('@')) {
    throw new Error(
      'Wachtwoordherstel per e-mail werkt alleen voor accounts die met een echt e-mailadres zijn aangemaakt.'
    );
  }
  await sendPasswordResetEmail(auth, trimmed.toLowerCase());
}

export async function sendVerificationForCurrentUser(): Promise<void> {
  if (!auth.currentUser || isSyntheticUsernameEmail(auth.currentUser.email)) {
    throw new Error('Geen geldig e-mailadres gekoppeld aan dit account.');
  }
  await sendEmailVerification(auth.currentUser);
}

export async function linkPasswordToCurrentAccount(password: string): Promise<void> {
  const current = auth.currentUser;
  if (!current || !current.email || isSyntheticUsernameEmail(current.email)) {
    throw new Error('Dit account heeft geen e-mailadres om een wachtwoord aan te koppelen.');
  }
  if (password.length < 6) {
    throw new Error('Het wachtwoord moet minimaal 6 tekens lang zijn.');
  }
  const cred = EmailAuthProvider.credential(current.email, password);
  try {
    await linkWithCredential(current, cred);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('requires-recent-login')) {
      await reauthenticateWithPopup(current, googleProvider);
      await linkWithCredential(current, cred);
      return;
    }
    throw err;
  }
}

export async function signOutAccount(): Promise<void> {
  await signOut(auth);
}

export async function ensureUserProfile(fbUser: FirebaseUser): Promise<AuthUser> {
  const uid = fbUser.uid;
  const isBootstrappedAdmin =
    fbUser.email === BOOTSTRAP_ADMIN_EMAIL && fbUser.emailVerified;

  let hasAdminMarker = false;
  try {
    const adminSnap = await withTimeout(
      getDoc(doc(db, 'admins', uid)),
      'beheerderscontrole',
      6000
    );
    hasAdminMarker = adminSnap.exists();
  } catch {
    hasAdminMarker = false;
  }

  const effectiveRole: UserRole =
    isBootstrappedAdmin || hasAdminMarker ? 'admin' : 'player';

  if (isBootstrappedAdmin && !hasAdminMarker) {
    try {
      await withTimeout(
        setDoc(doc(db, 'admins', uid), {
          uid,
          createdAt: serverTimestamp(),
        }),
        'beheerdersprofiel opslaan'
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `admins/${uid}`);
    }
  }

  const userRef = doc(db, 'users', uid);
  let snap;
  try {
    snap = await withTimeout(getDoc(userRef), 'gebruikersprofiel laden');
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `users/${uid}`);
  }

  const consumedPending = pendingDisplayName;
  pendingDisplayName = null;
  const displayName = clampStr(
    fbUser.displayName?.trim() ||
      consumedPending?.trim() ||
      fbUser.email?.split('@')[0] ||
      'Rechercheur',
    80
  );

  if (!snap.exists()) {
    try {
      await withTimeout(
        setDoc(userRef, {
          uid,
          displayName,
          role: effectiveRole,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
        'gebruikersprofiel aanmaken'
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `users/${uid}`);
    }
    return {
      id: uid,
      username: displayName,
      role: effectiveRole,
      createdAt: new Date().toISOString(),
    };
  }

  const data = snap.data() as Record<string, unknown>;
  const resolvedRole: UserRole =
    effectiveRole === 'admin' || data.role === 'admin' ? 'admin' : 'player';

  if (isBootstrappedAdmin && data.role !== 'admin') {
    try {
      await withTimeout(
        setDoc(userRef, {
          uid,
          displayName: String(data.displayName ?? displayName),
          role: 'admin',
          createdAt: data.createdAt ?? serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
        'beheerdersrol bijwerken'
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
    }
  }

  return {
    id: uid,
    username: String(data.displayName ?? displayName),
    role: resolvedRole,
    createdAt: toIso(data.createdAt),
  };
}

export async function ensureStarterSeedData(adminUid: string): Promise<void> {
  try {
    const [casesSnap, mapsSnap, commsSnap] = await withTimeout(
      Promise.all([
        getDocs(collection(db, 'cases')),
        getDocs(collection(db, 'mapTemplates')),
        getDocs(collection(db, 'communities')),
      ]),
      'startgegevens ophalen'
    );

    if (!casesSnap.empty && !mapsSnap.empty && !commsSnap.empty) return;

    const starter = createStarterCase();
    const mapTemplate = createStarterMapTemplate(starter);
    const community = createStarterCommunity(starter);

    const batch = writeBatch(db);
    let hasWrites = false;

    if (casesSnap.empty) {
      const casePayload = serializeCaseDoc(starter, adminUid);
      const publishedPayload = serializeCaseDoc(
        sanitizeCaseForPlayer(starter),
        adminUid
      );
      batch.set(doc(db, 'cases', starter.id), casePayload);
      batch.set(doc(db, 'publishedCases', starter.id), publishedPayload);
      batch.set(
        doc(db, 'caseCodes', codeLookupId(starter.joinCode ?? starter.code)),
        {
          caseId: starter.id,
          status: 'published',
          updatedAt: serverTimestamp(),
        }
      );
      batch.set(doc(db, 'caseCodes', codeLookupId(starter.id)), {
        caseId: starter.id,
        status: 'published',
        updatedAt: serverTimestamp(),
      });
      hasWrites = true;
    }

    if (mapsSnap.empty) {
      batch.set(doc(db, 'mapTemplates', mapTemplate.id), {
        id: mapTemplate.id,
        ownerId: adminUid,
        name: mapTemplate.name,
        townName: mapTemplate.townName,
        mapCols: mapTemplate.mapCols,
        mapRows: mapTemplate.mapRows,
        terrain: mapTemplate.terrain,
        locations: serializeLocations(mapTemplate.locations),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      hasWrites = true;
    }

    if (commsSnap.empty) {
      batch.set(doc(db, 'communities', community.id), {
        id: community.id,
        ownerId: adminUid,
        name: community.name,
        description: community.description,
        townName: community.townName,
        mapCols: community.mapCols,
        mapRows: community.mapRows,
        terrain: community.terrain,
        locations: serializeLocations(community.locations),
        persons: community.persons,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      hasWrites = true;
    }

    if (hasWrites) {
      await batch.commit();
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'cases/starter-seed');
  }
}

export async function migrateLegacyStaticDbToFirestore(
  user: AuthUser
): Promise<{ importedCases: number; importedMaps: number; importedNotes: number }> {
  const result = { importedCases: 0, importedMaps: 0, importedNotes: 0 };
  if (typeof window === 'undefined' || !window.localStorage) return result;

  const migrationKey = `teiscomysterics_migrated_v2_${user.id}`;
  try {
    if (window.localStorage.getItem(migrationKey) === '1') {
      return result;
    }
  } catch {
    return result;
  }

  let parsed: {
    cases?: CaseFile[];
    mapTemplates?: MapTemplate[];
    notes?: PlayerNote[];
  } | null = null;
  try {
    const raw = window.localStorage.getItem('teiscomysterics_static_db_v1');
    if (!raw) {
      window.localStorage.setItem(migrationKey, '1');
      return result;
    }
    parsed = JSON.parse(raw) as {
      cases?: CaseFile[];
      mapTemplates?: MapTemplate[];
      notes?: PlayerNote[];
    };
  } catch {
    return result;
  }

  if (!parsed) return result;

  if (user.role === 'admin') {
    if (Array.isArray(parsed.mapTemplates)) {
      for (const map of parsed.mapTemplates) {
        if (!map || !map.id) continue;
        const safeId = sanitizeId(map.id, 'map');
        try {
          const existing = await getDoc(doc(db, 'mapTemplates', safeId));
          if (!existing.exists()) {
            await saveMapTemplateToFirestore({ ...map, id: safeId }, user.id);
            result.importedMaps += 1;
          }
        } catch {
          // Continue migrating remaining maps cleanly
        }
      }
    }

    if (Array.isArray(parsed.cases)) {
      for (const caseItem of parsed.cases) {
        if (!caseItem || !caseItem.id) continue;
        const safeId = sanitizeId(caseItem.id, 'case');
        try {
          const existing = await getDoc(doc(db, 'cases', safeId));
          if (!existing.exists()) {
            await saveCaseToFirestore({ ...caseItem, id: safeId }, user.id, true);
            result.importedCases += 1;
          }
        } catch {
          // Continue migrating remaining cases cleanly
        }
      }
    }
  }

  if (Array.isArray(parsed.notes)) {
    for (const noteItem of parsed.notes) {
      if (!noteItem || !noteItem.caseId) continue;
      const safeCaseId = sanitizeId(noteItem.caseId, 'case');
      try {
        const existingNote = await getDoc(
          doc(db, 'users', user.id, 'notes', safeCaseId)
        );
        if (!existingNote.exists()) {
          await savePlayerNoteToFirestore(user.id, safeCaseId, {
            ...noteItem,
            caseId: safeCaseId,
            userId: user.id,
          });
          result.importedNotes += 1;
        }
      } catch {
        // Ignore unavailable notes cleanly
      }
    }
  }

  try {
    window.localStorage.setItem(migrationKey, '1');
  } catch {
    // Ignore storage quota errors
  }
  return result;
}

export function subscribeCases(
  user: AuthUser,
  onData: (cases: CaseFile[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  if (user.role === 'admin') {
    return onSnapshot(
      collection(db, 'cases'),
      (snap) => {
        const list = snap.docs
          .map((d) => hydrateCase(d.id, d.data() as Record<string, unknown>))
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        onData(list);
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, 'cases');
        } catch (wrapped) {
          onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
        }
      }
    );
  }

  return onSnapshot(
    collection(db, 'users', user.id, 'unlockedCases'),
    async (snap) => {
      try {
        const loaded = await Promise.all(
          snap.docs.map(async (unlockDoc) => {
            const caseId = unlockDoc.id;
            const pubSnap = await getDoc(doc(db, 'publishedCases', caseId));
            if (!pubSnap.exists()) return null;
            return hydrateCase(pubSnap.id, pubSnap.data() as Record<string, unknown>);
          })
        );
        const list = loaded
          .filter((c): c is CaseFile => c !== null && c.status === 'published')
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        onData(list);
      } catch (err) {
        try {
          handleFirestoreError(err, OperationType.GET, `users/${user.id}/unlockedCases`);
        } catch (wrapped) {
          onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
        }
      }
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, `users/${user.id}/unlockedCases`);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export function subscribeMapTemplates(
  onData: (maps: MapTemplate[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'mapTemplates'),
    (snap) => {
      const list = snap.docs
        .map((d) => hydrateMapTemplate(d.id, d.data() as Record<string, unknown>))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      onData(list);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, 'mapTemplates');
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export function subscribeCommunities(
  onData: (communities: CommunityTemplate[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'communities'),
    (snap) => {
      const list = snap.docs
        .map((d) => hydrateCommunity(d.id, d.data() as Record<string, unknown>))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      onData(list);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, 'communities');
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function saveCaseToFirestore(
  caseFile: CaseFile,
  adminUid: string,
  isNew = false
): Promise<CaseFile> {
  const caseId = sanitizeId(caseFile.id, 'case');
  const caseRef = doc(db, 'cases', caseId);
  let existingCreatedAt: unknown = undefined;
  let existingOwnerId = adminUid;
  let oldCodeKeys: string[] = [];

  if (!isNew) {
    try {
      const existingSnap = await getDoc(caseRef);
      if (existingSnap.exists()) {
        const d = existingSnap.data() as Record<string, unknown>;
        existingCreatedAt = d.createdAt;
        if (typeof d.ownerId === 'string') existingOwnerId = d.ownerId;
        oldCodeKeys = [
          codeLookupId(String(d.joinCode ?? '')),
          codeLookupId(String(d.code ?? '')),
          codeLookupId(caseId),
        ].filter(Boolean);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `cases/${caseId}`);
    }
  }

  const batch = writeBatch(db);
  const fullPayload = serializeCaseDoc(
    { ...caseFile, id: caseId },
    existingOwnerId,
    existingCreatedAt
  );
  batch.set(caseRef, fullPayload);

  const pubRef = doc(db, 'publishedCases', caseId);
  if (caseFile.status === 'published') {
    const sanitized = sanitizeCaseForPlayer({ ...caseFile, id: caseId });
    let pubCreatedAt: unknown = undefined;
    try {
      const pubSnap = await getDoc(pubRef);
      if (pubSnap.exists()) {
        pubCreatedAt = (pubSnap.data() as Record<string, unknown>).createdAt;
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `publishedCases/${caseId}`);
    }
    batch.set(pubRef, serializeCaseDoc(sanitized, existingOwnerId, pubCreatedAt));
  } else {
    batch.delete(pubRef);
  }

  const newKeys = Array.from(
    new Set(
      [
        codeLookupId(String(fullPayload.joinCode)),
        codeLookupId(String(fullPayload.code)),
        codeLookupId(caseId),
      ].filter(Boolean)
    )
  );

  for (const oldKey of oldCodeKeys) {
    if (!newKeys.includes(oldKey)) {
      batch.delete(doc(db, 'caseCodes', oldKey));
    }
  }

  for (const key of newKeys) {
    batch.set(doc(db, 'caseCodes', key), {
      caseId,
      status: fullPayload.status,
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `cases/${caseId}`);
  }

  return {
    ...caseFile,
    id: caseId,
    code: String(fullPayload.code),
    joinCode: String(fullPayload.joinCode),
    updatedAt: new Date().toISOString(),
  };
}

export async function deleteCaseFromFirestore(caseId: string): Promise<void> {
  const safeId = sanitizeId(caseId, 'case');
  try {
    const snap = await getDoc(doc(db, 'cases', safeId));
    const batch = writeBatch(db);
    if (snap.exists()) {
      const d = snap.data() as Record<string, unknown>;
      const keys = [
        codeLookupId(String(d.joinCode ?? '')),
        codeLookupId(String(d.code ?? '')),
        codeLookupId(safeId),
      ].filter(Boolean);
      for (const k of keys) {
        batch.delete(doc(db, 'caseCodes', k));
      }
    }
    batch.delete(doc(db, 'cases', safeId));
    batch.delete(doc(db, 'publishedCases', safeId));
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `cases/${safeId}`);
  }
}

export async function redeemCaseCodeInFirestore(
  user: AuthUser,
  rawCode: string
): Promise<CaseFile> {
  const candidates = normalizeRedeemInput(rawCode);
  if (candidates.length === 0) {
    throw new Error('Vul een geldige dossiercode in.');
  }

  let matchedCaseId: string | null = null;
  let matchedStatus: string | null = null;
  let matchedKey = candidates[0];

  for (const cand of candidates) {
    try {
      const lookupSnap = await getDoc(doc(db, 'caseCodes', cand));
      if (lookupSnap.exists()) {
        const data = lookupSnap.data() as Record<string, unknown>;
        matchedCaseId = String(data.caseId ?? '');
        matchedStatus = String(data.status ?? 'draft');
        matchedKey = cand;
        break;
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `caseCodes/${cand}`);
    }
  }

  if (!matchedCaseId) {
    throw new Error(
      'Geen dossier gevonden met deze code. Controleer de toegangscode in je papieren dossier.'
    );
  }

  if (user.role !== 'admin' && matchedStatus !== 'published') {
    throw new Error(
      'Dit dossier staat nog op Concept. Zet de status in de Bouwer Versie op Gepubliceerd.'
    );
  }

  const unlockRef = doc(db, 'users', user.id, 'unlockedCases', matchedCaseId);
  try {
    const existingUnlock = await getDoc(unlockRef);
    if (!existingUnlock.exists()) {
      await setDoc(unlockRef, {
        caseId: matchedCaseId,
        codeUsed: clampStr(matchedKey, 64),
        unlockedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(
      err,
      OperationType.WRITE,
      `users/${user.id}/unlockedCases/${matchedCaseId}`
    );
  }

  try {
    const pubSnap = await getDoc(doc(db, 'publishedCases', matchedCaseId));
    if (!pubSnap.exists()) {
      throw new Error('Dit dossier is momenteel niet gepubliceerd voor spelers.');
    }
    return hydrateCase(pubSnap.id, pubSnap.data() as Record<string, unknown>);
  } catch (err) {
    if (err instanceof Error && err.message.includes('momenteel niet gepubliceerd')) {
      throw err;
    }
    handleFirestoreError(err, OperationType.GET, `publishedCases/${matchedCaseId}`);
  }
}

export async function getPlayerNoteFromFirestore(
  userId: string,
  caseId: string
): Promise<PlayerNote> {
  const path = `users/${userId}/notes/${caseId}`;
  try {
    const snap = await getDoc(doc(db, 'users', userId, 'notes', caseId));
    if (!snap.exists()) {
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
    const d = snap.data() as Record<string, unknown>;
    return {
      caseId,
      userId,
      generalNotes: String(d.generalNotes ?? ''),
      suspectMarks: (d.suspectMarks as PlayerNote['suspectMarks']) ?? {},
      pinnedClues: Array.isArray(d.pinnedClues) ? (d.pinnedClues as string[]) : [],
      customTraces: Array.isArray(d.customTraces)
        ? (d.customTraces as PlayerNote['customTraces'])
        : [],
      updatedAt: toIso(d.updatedAt),
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function savePlayerNoteToFirestore(
  userId: string,
  caseId: string,
  note: PlayerNote
): Promise<PlayerNote> {
  const safeCaseId = sanitizeId(caseId, 'case');
  const path = `users/${userId}/notes/${safeCaseId}`;
  try {
    await setDoc(doc(db, 'users', userId, 'notes', safeCaseId), {
      caseId: safeCaseId,
      userId,
      generalNotes: clampStr(note.generalNotes ?? '', 20000),
      suspectMarks: note.suspectMarks ?? {},
      pinnedClues: Array.isArray(note.pinnedClues) ? note.pinnedClues.slice(0, 100) : [],
      customTraces: Array.isArray(note.customTraces) ? note.customTraces.slice(0, 50) : [],
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
  return {
    ...note,
    caseId: safeCaseId,
    userId,
    updatedAt: new Date().toISOString(),
  };
}

export async function saveMapTemplateToFirestore(
  payload: Partial<MapTemplate> & { id?: string },
  adminUid: string
): Promise<void> {
  const mapId = sanitizeId(payload.id ?? `map-${Date.now().toString(36)}`, 'map');
  const ref = doc(db, 'mapTemplates', mapId);
  let existingCreatedAt: unknown = undefined;
  let existingOwnerId = adminUid;
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const d = snap.data() as Record<string, unknown>;
      existingCreatedAt = d.createdAt;
      if (typeof d.ownerId === 'string') existingOwnerId = d.ownerId;
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `mapTemplates/${mapId}`);
  }

  try {
    await setDoc(ref, {
      id: mapId,
      ownerId: existingOwnerId,
      name: clampStr((payload.name ?? 'Nieuwe Kaart').trim() || 'Nieuwe Kaart', 100),
      townName: clampStr((payload.townName ?? 'Nieuw Dorp').trim() || 'Nieuw Dorp', 100),
      mapCols: Math.max(8, Math.min(48, Math.floor(payload.mapCols || MAP_COLS))),
      mapRows: Math.max(6, Math.min(36, Math.floor(payload.mapRows || MAP_ROWS))),
      terrain: Array.isArray(payload.terrain) ? payload.terrain.slice(0, 1728) : [],
      locations: serializeLocations(payload.locations),
      createdAt: existingCreatedAt ?? serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `mapTemplates/${mapId}`);
  }
}

export async function deleteMapTemplateFromFirestore(mapId: string): Promise<void> {
  const safeId = sanitizeId(mapId, 'map');
  try {
    await deleteDoc(doc(db, 'mapTemplates', safeId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `mapTemplates/${safeId}`);
  }
}

export async function saveCommunityToFirestore(
  payload: Partial<CommunityTemplate> & { id?: string },
  adminUid: string
): Promise<void> {
  const commId = sanitizeId(payload.id ?? `comm-${Date.now().toString(36)}`, 'comm');
  const ref = doc(db, 'communities', commId);
  let existingCreatedAt: unknown = undefined;
  let existingOwnerId = adminUid;
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const d = snap.data() as Record<string, unknown>;
      existingCreatedAt = d.createdAt;
      if (typeof d.ownerId === 'string') existingOwnerId = d.ownerId;
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `communities/${commId}`);
  }

  try {
    await setDoc(ref, {
      id: commId,
      ownerId: existingOwnerId,
      name: clampStr((payload.name ?? 'Nieuwe Community').trim() || 'Nieuwe Community', 100),
      description: clampStr(payload.description ?? '', 500),
      townName: clampStr((payload.townName ?? 'Nieuw Dorp').trim() || 'Nieuw Dorp', 100),
      mapCols: Math.max(8, Math.min(48, Math.floor(payload.mapCols || MAP_COLS))),
      mapRows: Math.max(6, Math.min(36, Math.floor(payload.mapRows || MAP_ROWS))),
      terrain: Array.isArray(payload.terrain) ? payload.terrain.slice(0, 1728) : [],
      locations: serializeLocations(payload.locations),
      persons: Array.isArray(payload.persons) ? payload.persons.slice(0, 60) : [],
      createdAt: existingCreatedAt ?? serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `communities/${commId}`);
  }
}

export async function deleteCommunityFromFirestore(communityId: string): Promise<void> {
  const safeId = sanitizeId(communityId, 'comm');
  try {
    await deleteDoc(doc(db, 'communities', safeId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `communities/${safeId}`);
  }
}

export interface BackupBundle {
  version?: number;
  exportedAt?: string;
  theme?: 'dark' | 'light';
  cases?: CaseFile[];
  mapTemplates?: MapTemplate[];
  communities?: CommunityTemplate[];
}

export async function importBackupToFirestore(
  bundle: BackupBundle,
  adminUid: string
): Promise<{ casesAdded: number; mapsAdded: number; communitiesAdded: number }> {
  let casesAdded = 0;
  let mapsAdded = 0;
  let communitiesAdded = 0;

  if (Array.isArray(bundle.mapTemplates)) {
    for (const map of bundle.mapTemplates) {
      if (!map || !map.id) continue;
      const safeId = sanitizeId(map.id, 'map');
      const existing = await getDoc(doc(db, 'mapTemplates', safeId));
      if (!existing.exists()) {
        await saveMapTemplateToFirestore({ ...map, id: safeId }, adminUid);
        mapsAdded += 1;
      }
    }
  }

  if (Array.isArray(bundle.communities)) {
    for (const comm of bundle.communities) {
      if (!comm || !comm.id) continue;
      const safeId = sanitizeId(comm.id, 'comm');
      const existing = await getDoc(doc(db, 'communities', safeId));
      if (!existing.exists()) {
        await saveCommunityToFirestore({ ...comm, id: safeId }, adminUid);
        communitiesAdded += 1;
      }
    }
  }

  if (Array.isArray(bundle.cases)) {
    for (const c of bundle.cases) {
      if (!c || !c.id) continue;
      const safeId = sanitizeId(c.id, 'case');
      const existing = await getDoc(doc(db, 'cases', safeId));
      if (!existing.exists()) {
        await saveCaseToFirestore({ ...c, id: safeId }, adminUid, true);
        casesAdded += 1;
      }
    }
  }

  return { casesAdded, mapsAdded, communitiesAdded };
}
