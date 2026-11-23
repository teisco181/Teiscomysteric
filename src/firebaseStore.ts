import {
  signInWithPopup,
  signOut,
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
    locations: Array.isArray(caseFile.locations) ? caseFile.locations.slice(0, 100) : [],
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

export async function signInWithGoogleAccount(): Promise<FirebaseUser> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
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
    const adminSnap = await getDoc(doc(db, 'admins', uid));
    hasAdminMarker = adminSnap.exists();
  } catch {
    hasAdminMarker = false;
  }

  const effectiveRole: UserRole =
    isBootstrappedAdmin || hasAdminMarker ? 'admin' : 'player';

  if (isBootstrappedAdmin && !hasAdminMarker) {
    try {
      await setDoc(doc(db, 'admins', uid), {
        uid,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `admins/${uid}`);
    }
  }

  const userRef = doc(db, 'users', uid);
  let snap;
  try {
    snap = await getDoc(userRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `users/${uid}`);
  }

  const displayName = clampStr(
    fbUser.displayName?.trim() || fbUser.email?.split('@')[0] || 'Rechercheur',
    80
  );

  if (!snap.exists()) {
    try {
      await setDoc(userRef, {
        uid,
        displayName,
        role: effectiveRole,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
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
      await setDoc(
        userRef,
        {
          uid,
          displayName: String(data.displayName ?? displayName),
          role: 'admin',
          createdAt: data.createdAt ?? serverTimestamp(),
          updatedAt: serverTimestamp(),
        }
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
    const casesSnap = await getDocs(collection(db, 'cases'));
    if (!casesSnap.empty) return;

    const starter = createStarterCase();
    const mapTemplate = createStarterMapTemplate(starter);
    const community = createStarterCommunity(starter);

    const batch = writeBatch(db);
    const casePayload = serializeCaseDoc(starter, adminUid);
    const publishedPayload = serializeCaseDoc(sanitizeCaseForPlayer(starter), adminUid);

    batch.set(doc(db, 'cases', starter.id), casePayload);
    batch.set(doc(db, 'publishedCases', starter.id), publishedPayload);
    batch.set(doc(db, 'caseCodes', codeLookupId(starter.joinCode ?? starter.code)), {
      caseId: starter.id,
      status: 'published',
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'caseCodes', codeLookupId(starter.id)), {
      caseId: starter.id,
      status: 'published',
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'mapTemplates', mapTemplate.id), {
      id: mapTemplate.id,
      ownerId: adminUid,
      name: mapTemplate.name,
      townName: mapTemplate.townName,
      mapCols: mapTemplate.mapCols,
      mapRows: mapTemplate.mapRows,
      terrain: mapTemplate.terrain,
      locations: mapTemplate.locations,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'communities', community.id), {
      id: community.id,
      ownerId: adminUid,
      name: community.name,
      description: community.description,
      townName: community.townName,
      mapCols: community.mapCols,
      mapRows: community.mapRows,
      terrain: community.terrain,
      locations: community.locations,
      persons: community.persons,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'cases/starter-seed');
  }
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
      locations: Array.isArray(payload.locations) ? payload.locations.slice(0, 100) : [],
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
      locations: Array.isArray(payload.locations) ? payload.locations.slice(0, 100) : [],
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
