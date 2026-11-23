import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { KeyRound, LogOut, MailCheck, Moon, RefreshCw, Shield, Sun, User, X } from 'lucide-react';
import { AuthPortal } from './components/AuthPortal.tsx';
import { MakerStudio, type MakerTab } from './components/MakerStudio.tsx';
import { PlayerCodeGate } from './components/PlayerCodeGate.tsx';
import { PlayerPortal, type PlayerTab } from './components/PlayerPortal.tsx';
import { PrintableDossierModal } from './components/PrintableDossierModal.tsx';
import { auth } from './firebase.ts';
import {
  deleteCaseFromFirestore,
  deleteCommunityFromFirestore,
  deleteMapTemplateFromFirestore,
  ensureStarterSeedData,
  ensureUserProfile,
  getPlayerNoteFromFirestore,
  importBackupToFirestore,
  isSyntheticUsernameEmail,
  linkPasswordToCurrentAccount,
  migrateLegacyStaticDbToFirestore,
  redeemCaseCodeInFirestore,
  saveCaseToFirestore,
  saveCommunityToFirestore,
  saveMapTemplateToFirestore,
  savePlayerNoteToFirestore,
  sendVerificationForCurrentUser,
  signOutAccount,
  subscribeCases,
  subscribeCommunities,
  subscribeMapTemplates,
  type BackupBundle,
} from './firebaseStore.ts';
import {
  MAP_COLS,
  MAP_ROWS,
  type AuthUser,
  type CaseFile,
  type CommunityTemplate,
  type MapTemplate,
  type Person,
  type PlayerNote,
  type TerrainType,
} from './types.ts';

const EMPTY_NOTE = (caseId: string, userId: string): PlayerNote => ({
  caseId,
  userId,
  generalNotes: '',
  suspectMarks: {},
  pinnedClues: [],
  customTraces: [],
  updatedAt: new Date().toISOString(),
});

function clonePersons(persons: Person[], resetSecrets = false): Person[] {
  return persons.map((p) => ({
    ...p,
    fingerprint: Array.isArray(p.fingerprint) ? [...p.fingerprint] : [],
    isCulprit: resetSecrets ? false : p.isCulprit,
    creatorSecretNote: resetSecrets ? '' : p.creatorSecretNote,
  }));
}

function generateNextCaseCode(existingCases: CaseFile[]): string {
  const num = existingCases.length + 48;
  return `ZAAK-${String(num).padStart(3, '0')}`;
}

function readStoredSetting(key: string): string | null {
  try {
    return typeof window !== 'undefined' && window.localStorage
      ? window.localStorage.getItem(key)
      : null;
  } catch {
    return null;
  }
}

function writeStoredSetting(key: string, value: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // Ignore storage quota errors
  }
}

export default function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() =>
    readStoredSetting('teiscomysterics_theme') === 'light' ? 'light' : 'dark'
  );
  const [authReady, setAuthReady] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [accountMeta, setAccountMeta] = useState<{
    email: string | null;
    emailVerified: boolean;
    hasPasswordProvider: boolean;
  }>({ email: null, emailVerified: false, hasPasswordProvider: false });
  const [showLinkPasswordModal, setShowLinkPasswordModal] = useState(false);
  const [linkPasswordValue, setLinkPasswordValue] = useState('');
  const [linkPasswordConfirm, setLinkPasswordConfirm] = useState('');
  const [linkPasswordBusy, setLinkPasswordBusy] = useState(false);
  const [linkPasswordMsg, setLinkPasswordMsg] = useState<string | null>(null);
  const [verificationMsg, setVerificationMsg] = useState<string | null>(null);

  // Admin can preview as player without logging out
  const [viewMode, setViewMode] = useState<'maker' | 'player'>(() =>
    readStoredSetting('teiscomysterics_view_mode') === 'player' ? 'player' : 'maker'
  );
  const [makerTab, setMakerTab] = useState<MakerTab>('dossier');
  const [playerTab, setPlayerTab] = useState<PlayerTab>('overzicht');

  const [cases, setCases] = useState<CaseFile[]>([]);
  const [mapTemplates, setMapTemplates] = useState<MapTemplate[]>([]);
  const [communities, setCommunities] = useState<CommunityTemplate[]>([]);
  const [activeCaseId, setActiveCaseId] = useState<string>(
    () => readStoredSetting('teiscomysterics_active_case') ?? ''
  );
  const [draftCase, setDraftCase] = useState<CaseFile | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isSavingCase, setIsSavingCase] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const [note, setNote] = useState<PlayerNote | null>(null);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [noteSaveMessage, setNoteSaveMessage] = useState<string | null>(null);

  const [loadingData, setLoadingData] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [showPrintModal, setShowPrintModal] = useState(false);

  const latestDraftRef = useRef<CaseFile | null>(null);
  const activeCaseIdRef = useRef<string>('');
  const isDirtyRef = useRef(false);
  const isSavingRef = useRef(false);
  const draftVersionRef = useRef(0);

  useEffect(() => {
    latestDraftRef.current = draftCase;
  }, [draftCase]);

  useEffect(() => {
    activeCaseIdRef.current = activeCaseId;
  }, [activeCaseId]);

  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  useEffect(() => {
    isSavingRef.current = isSavingCase;
  }, [isSavingCase]);

  // Sync Tailwind v4 `.dark` class on <html> and persist theme preference
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    writeStoredSetting('teiscomysterics_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Observe Firebase Auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        setAuthUser(null);
        setAccountMeta({ email: null, emailVerified: false, hasPasswordProvider: false });
        setCases([]);
        setMapTemplates([]);
        setCommunities([]);
        setActiveCaseId('');
        setDraftCase(null);
        setNote(null);
        setIsDirty(false);
        setLoadError(null);
        setAuthLoading(false);
        setAuthReady(true);
        return;
      }

      setAuthLoading(true);
      setAuthError(null);
      setAccountMeta({
        email: fbUser.email,
        emailVerified: fbUser.emailVerified,
        hasPasswordProvider: fbUser.providerData.some((p) => p.providerId === 'password'),
      });
      try {
        const profile = await ensureUserProfile(fbUser);
        setAuthUser(profile);
        if (profile.role === 'admin') {
          const savedView = readStoredSetting('teiscomysterics_view_mode');
          setViewMode(savedView === 'player' ? 'player' : 'maker');
        } else {
          setViewMode('player');
        }
      } catch (err) {
        setAuthError(
          err instanceof Error
            ? err.message
            : 'Gebruikersprofiel kon niet worden geladen uit Firestore.'
        );
        setAuthUser(null);
      } finally {
        setAuthLoading(false);
        setAuthReady(true);
      }
    });

    return () => unsubscribe();
  }, []);

  // Subscribe to Firestore collections after auth is ready
  useEffect(() => {
    if (!authReady || !authUser) return;

    let cancelled = false;
    let unsubCases: (() => void) | null = null;
    let unsubMaps: (() => void) | null = null;
    let unsubCommunities: (() => void) | null = null;

    const startSubscriptions = async () => {
      setLoadingData(true);
      setLoadError(null);

      try {
        if (authUser.role === 'admin') {
          await ensureStarterSeedData(authUser.id);
        }
        await migrateLegacyStaticDbToFirestore(authUser);
        if (cancelled) return;

        unsubCases = subscribeCases(
          authUser,
          (list) => {
            if (cancelled) return;
            setCases(list);
            setLoadingData(false);

            const preferredId =
              activeCaseIdRef.current ||
              readStoredSetting('teiscomysterics_active_case') ||
              '';
            const currentMatch = list.find((c) => c.id === preferredId);
            if (!currentMatch) {
              const first = list[0] ?? null;
              draftVersionRef.current += 1;
              setActiveCaseId(first?.id ?? '');
              if (first?.id) {
                writeStoredSetting('teiscomysterics_active_case', first.id);
              }
              setDraftCase(first);
              latestDraftRef.current = first;
              setIsDirty(false);
              isDirtyRef.current = false;
            } else {
              if (activeCaseIdRef.current !== currentMatch.id) {
                setActiveCaseId(currentMatch.id);
                activeCaseIdRef.current = currentMatch.id;
              }
              if (!isDirtyRef.current && !isSavingRef.current) {
                setDraftCase(currentMatch);
                latestDraftRef.current = currentMatch;
              }
            }
          },
          (err) => {
            if (cancelled) return;
            setLoadError(err.message || 'Kon dossiers niet laden.');
            setLoadingData(false);
          }
        );

        if (authUser.role === 'admin') {
          unsubMaps = subscribeMapTemplates(
            (maps) => {
              if (!cancelled) setMapTemplates(maps);
            },
            (err) => {
              if (!cancelled) {
                setLoadError((prev) => prev ?? err.message);
              }
            }
          );

          unsubCommunities = subscribeCommunities(
            (comms) => {
              if (!cancelled) setCommunities(comms);
            },
            (err) => {
              if (!cancelled) {
                setLoadError((prev) => prev ?? err.message);
              }
            }
          );
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : 'Verbinding met Firestore mislukt.'
          );
          setLoadingData(false);
        }
      }
    };

    void startSubscriptions();

    return () => {
      cancelled = true;
      unsubCases?.();
      unsubMaps?.();
      unsubCommunities?.();
    };
  }, [authReady, authUser, reloadNonce]);

  const handleLogout = async () => {
    try {
      await signOutAccount();
    } catch {
      // Ignore transient signOut errors
    }
  };

  // Load player notes whenever active case changes
  useEffect(() => {
    if (!authUser || !activeCaseId) {
      setNote(null);
      return;
    }
    let cancelled = false;
    getPlayerNoteFromFirestore(authUser.id, activeCaseId)
      .then((loaded) => {
        if (!cancelled) setNote(loaded);
      })
      .catch(() => {
        if (!cancelled) setNote(EMPTY_NOTE(activeCaseId, authUser.id));
      });
    return () => {
      cancelled = true;
    };
  }, [authUser, activeCaseId]);

  const handleSelectCase = (caseId: string) => {
    const found = cases.find((c) => c.id === caseId);
    if (!found) return;
    draftVersionRef.current += 1;
    setActiveCaseId(found.id);
    activeCaseIdRef.current = found.id;
    writeStoredSetting('teiscomysterics_active_case', found.id);
    setDraftCase(found);
    latestDraftRef.current = found;
    setIsDirty(false);
    isDirtyRef.current = false;
    setSaveMessage(null);
    setNoteSaveMessage(null);
  };

  const handleUpdateDraft = (next: CaseFile) => {
    draftVersionRef.current += 1;
    latestDraftRef.current = next;
    isDirtyRef.current = true;
    setDraftCase(next);
    setIsDirty(true);
    setSaveMessage(null);
  };

  const handleSaveCase = useCallback(
    async (overrideCase?: CaseFile, options?: { auto?: boolean }) => {
      const target = overrideCase ?? latestDraftRef.current;
      if (!authUser || !target || isSavingRef.current) return;
      const versionAtStart = draftVersionRef.current;
      const targetId = target.id;

      isSavingRef.current = true;
      setIsSavingCase(true);
      if (!options?.auto) {
        setSaveMessage(null);
      }
      try {
        const saved = await saveCaseToFirestore(target, authUser.id, false);
        setCases((prev) => prev.map((c) => (c.id === saved.id ? saved : c)));
        // Only overwrite draftCase if the user did not edit or switch cases while saving
        if (
          draftVersionRef.current === versionAtStart &&
          activeCaseIdRef.current === targetId
        ) {
          setDraftCase(saved);
          latestDraftRef.current = saved;
          setIsDirty(false);
          isDirtyRef.current = false;
        }
        setSaveMessage(
          options?.auto ? 'Automatisch opgeslagen' : 'Dossier opgeslagen'
        );
        setTimeout(() => setSaveMessage(null), 3000);
      } catch (err) {
        setSaveMessage(
          err instanceof Error ? err.message : 'Opslaan mislukt.'
        );
      } finally {
        isSavingRef.current = false;
        setIsSavingCase(false);
      }
    },
    [authUser]
  );

  // Auto-save active dossier every 5 seconds while editing in Maker mode
  useEffect(() => {
    if (!authUser || authUser.role !== 'admin' || viewMode !== 'maker') return;
    const intervalId = window.setInterval(() => {
      if (!isDirtyRef.current || isSavingRef.current) return;
      const current = latestDraftRef.current;
      if (!current) return;
      void handleSaveCase(current, { auto: true });
    }, 5000);
    return () => window.clearInterval(intervalId);
  }, [authUser, viewMode, handleSaveCase]);

  const handleCreateCase = async () => {
    if (!authUser) return;
    setIsSavingCase(true);
    try {
      const firstCommunity = communities[0];
      const firstMap = mapTemplates[0];
      const cols = firstCommunity?.mapCols ?? firstMap?.mapCols ?? MAP_COLS;
      const rows = firstCommunity?.mapRows ?? firstMap?.mapRows ?? MAP_ROWS;
      const terrain: TerrainType[] = firstCommunity
        ? [...firstCommunity.terrain]
        : firstMap
          ? [...firstMap.terrain]
          : new Array<TerrainType>(cols * rows).fill('grass');
      const locations = firstCommunity
        ? firstCommunity.locations.map((l) => ({ ...l }))
        : firstMap
          ? firstMap.locations.map((l) => ({ ...l }))
          : [];
      const persons = firstCommunity
        ? clonePersons(firstCommunity.persons, true)
        : [];

      const code = generateNextCaseCode(cases);
      const now = new Date().toISOString();
      const newCase: CaseFile = {
        id: `case-${Date.now().toString(36)}`,
        code,
        joinCode: code,
        title: `Nieuw Mysterie ${cases.length + 1}`,
        townName: firstCommunity?.townName ?? firstMap?.townName ?? 'Nieuw Dorp',
        subtitle: 'Onopgeloste zaak',
        status: 'published',
        briefing: 'Beschrijf hier de aanleiding en eerste melding voor de rechercheurs.',
        printedDossierGuide:
          'Gebruik de spoorcodes op uw papieren dossier in de Vingerafdruk Vergelijker.',
        mapCols: cols,
        mapRows: rows,
        terrain,
        locations,
        persons,
        evidence: [],
        createdAt: now,
        updatedAt: now,
      };

      const saved = await saveCaseToFirestore(newCase, authUser.id, true);
      draftVersionRef.current += 1;
      setCases((prev) =>
        prev.some((c) => c.id === saved.id) ? prev : [...prev, saved]
      );
      setActiveCaseId(saved.id);
      activeCaseIdRef.current = saved.id;
      setDraftCase(saved);
      latestDraftRef.current = saved;
      setIsDirty(false);
      isDirtyRef.current = false;
      setMakerTab('dossier');
      setSaveMessage('Nieuw dossier aangemaakt');
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err) {
      setSaveMessage(
        err instanceof Error ? err.message : 'Aanmaken van dossier mislukt.'
      );
    } finally {
      setIsSavingCase(false);
    }
  };

  const handleDeleteCase = async (caseId: string) => {
    if (!authUser) return;
    await deleteCaseFromFirestore(caseId);
    const remaining = cases.filter((c) => c.id !== caseId);
    setCases(remaining);
    const next = remaining[0] ?? null;
    draftVersionRef.current += 1;
    setActiveCaseId(next?.id ?? '');
    activeCaseIdRef.current = next?.id ?? '';
    setDraftCase(next);
    latestDraftRef.current = next;
    setIsDirty(false);
    isDirtyRef.current = false;
  };

  // Map template handlers
  const handleSaveNewMapTemplate = async (name: string) => {
    if (!authUser || !draftCase) return;
    await saveMapTemplateToFirestore(
      {
        name,
        townName: draftCase.townName,
        mapCols: draftCase.mapCols,
        mapRows: draftCase.mapRows,
        terrain: [...draftCase.terrain],
        locations: draftCase.locations.map((l) => ({ ...l })),
      },
      authUser.id
    );
  };

  const handleUpdateMapTemplate = async (mapId: string) => {
    if (!authUser || !draftCase) return;
    const existing = mapTemplates.find((m) => m.id === mapId);
    await saveMapTemplateToFirestore(
      {
        id: mapId,
        name: existing?.name ?? draftCase.townName,
        townName: draftCase.townName,
        mapCols: draftCase.mapCols,
        mapRows: draftCase.mapRows,
        terrain: [...draftCase.terrain],
        locations: draftCase.locations.map((l) => ({ ...l })),
      },
      authUser.id
    );
  };

  const handleApplyMapTemplate = (template: MapTemplate) => {
    if (!draftCase) return;
    handleUpdateDraft({
      ...draftCase,
      townName: template.townName,
      mapCols: template.mapCols,
      mapRows: template.mapRows,
      terrain: [...template.terrain],
      locations: template.locations.map((l) => ({ ...l })),
    });
  };

  const handleDeleteMapTemplate = async (mapId: string) => {
    await deleteMapTemplateFromFirestore(mapId);
  };

  // Community handlers (reusable map + persons across multiple cases)
  const handleSaveNewCommunity = async (name: string, description: string) => {
    if (!authUser || !draftCase) return;
    await saveCommunityToFirestore(
      {
        name,
        description,
        townName: draftCase.townName,
        mapCols: draftCase.mapCols,
        mapRows: draftCase.mapRows,
        terrain: [...draftCase.terrain],
        locations: draftCase.locations.map((l) => ({ ...l })),
        persons: clonePersons(draftCase.persons, false),
      },
      authUser.id
    );
  };

  const handleUpdateCommunity = async (communityId: string) => {
    if (!authUser || !draftCase) return;
    const existing = communities.find((c) => c.id === communityId);
    await saveCommunityToFirestore(
      {
        id: communityId,
        name: existing?.name ?? draftCase.townName,
        description: existing?.description ?? '',
        townName: draftCase.townName,
        mapCols: draftCase.mapCols,
        mapRows: draftCase.mapRows,
        terrain: [...draftCase.terrain],
        locations: draftCase.locations.map((l) => ({ ...l })),
        persons: clonePersons(draftCase.persons, false),
      },
      authUser.id
    );
  };

  const handleApplyCommunity = (community: CommunityTemplate) => {
    if (!draftCase) return;
    handleUpdateDraft({
      ...draftCase,
      townName: community.townName,
      mapCols: community.mapCols,
      mapRows: community.mapRows,
      terrain: [...community.terrain],
      locations: community.locations.map((l) => ({ ...l })),
      persons: clonePersons(community.persons, false),
    });
  };

  const handleCreateCaseFromCommunity = async (community: CommunityTemplate) => {
    if (!authUser) return;
    setIsSavingCase(true);
    try {
      const code = generateNextCaseCode(cases);
      const now = new Date().toISOString();
      const newCase: CaseFile = {
        id: `case-${Date.now().toString(36)}`,
        code,
        joinCode: code,
        title: `Nieuwe zaak in ${community.townName}`,
        townName: community.townName,
        subtitle: `Community: ${community.name}`,
        status: 'published',
        briefing:
          community.description ||
          `Nieuw mysterie in ${community.townName}. De bekende bewoners en locaties staan al klaar.`,
        printedDossierGuide:
          'Vergelijk spoorcodes uit het papieren dossier met de vingerafdrukdatabank.',
        mapCols: community.mapCols,
        mapRows: community.mapRows,
        terrain: [...community.terrain],
        locations: community.locations.map((l) => ({ ...l })),
        persons: clonePersons(community.persons, true),
        evidence: [],
        createdAt: now,
        updatedAt: now,
      };

      const saved = await saveCaseToFirestore(newCase, authUser.id, true);
      draftVersionRef.current += 1;
      setCases((prev) =>
        prev.some((c) => c.id === saved.id) ? prev : [...prev, saved]
      );
      setActiveCaseId(saved.id);
      activeCaseIdRef.current = saved.id;
      setDraftCase(saved);
      latestDraftRef.current = saved;
      setIsDirty(false);
      isDirtyRef.current = false;
      setMakerTab('dossier');
      setSaveMessage(`Nieuw dossier gestart vanuit "${community.name}"`);
      setTimeout(() => setSaveMessage(null), 3500);
    } catch (err) {
      setSaveMessage(
        err instanceof Error ? err.message : 'Aanmaken vanuit community mislukt.'
      );
    } finally {
      setIsSavingCase(false);
    }
  };

  const handleDeleteCommunity = async (communityId: string) => {
    await deleteCommunityFromFirestore(communityId);
  };

  // Player handlers
  const handleSaveNote = async () => {
    if (!authUser || !activeCaseId || !note) return;
    setIsSavingNote(true);
    setNoteSaveMessage(null);
    try {
      const saved = await savePlayerNoteToFirestore(authUser.id, activeCaseId, note);
      setNote(saved);
      setNoteSaveMessage('Aantekeningen opgeslagen');
      setTimeout(() => setNoteSaveMessage(null), 3000);
    } catch (err) {
      setNoteSaveMessage(
        err instanceof Error ? err.message : 'Opslaan van aantekeningen mislukt.'
      );
    } finally {
      setIsSavingNote(false);
    }
  };

  const handleUnlockedCase = (unlocked: CaseFile) => {
    setCases((prev) => {
      const exists = prev.some((c) => c.id === unlocked.id);
      return exists
        ? prev.map((c) => (c.id === unlocked.id ? unlocked : c))
        : [...prev, unlocked];
    });
    draftVersionRef.current += 1;
    setActiveCaseId(unlocked.id);
    activeCaseIdRef.current = unlocked.id;
    setDraftCase(unlocked);
    latestDraftRef.current = unlocked;
    setIsDirty(false);
    isDirtyRef.current = false;
    setPlayerTab('overzicht');
  };

  const handleRedeemCode = async (code: string): Promise<CaseFile> => {
    if (!authUser) {
      throw new Error('Log eerst in om een dossiercode in te voeren.');
    }
    const unlocked = await redeemCaseCodeInFirestore(authUser, code);
    handleUnlockedCase(unlocked);
    return unlocked;
  };

  const navItems = useMemo(() => {
    if (authUser?.role === 'admin' && viewMode === 'maker') {
      return [
        { id: 'dossier', label: 'Dossier' },
        { id: 'kaart', label: 'Kaartbouwer' },
        { id: 'personen', label: 'Personen' },
        { id: 'vingerafdrukken', label: 'Vingerafdrukken' },
        { id: 'bewijsstukken', label: 'Bewijsstukken' },
      ] as const;
    }
    return [
      { id: 'overzicht', label: 'Overzicht' },
      { id: 'kaart', label: 'Dorpskaart' },
      { id: 'personen', label: 'Personen' },
      { id: 'vergelijker', label: 'Vergelijker' },
      { id: 'aantekeningen', label: 'Aantekeningen' },
    ] as const;
  }, [authUser, viewMode]);

  const activeNavId =
    authUser?.role === 'admin' && viewMode === 'maker' ? makerTab : playerTab;

  const handleNavClick = (id: string) => {
    if (authUser?.role === 'admin' && viewMode === 'maker') {
      setMakerTab(id as MakerTab);
    } else {
      setPlayerTab(id as PlayerTab);
    }
  };

  if (!authReady || !authUser) {
    return (
      <AuthPortal
        theme={theme}
        onToggleTheme={toggleTheme}
        authLoading={authLoading}
        externalError={authError}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#080C10] text-slate-900 dark:text-slate-100 transition-colors">
      {/* 3-Zone Top Bar Contract */}
      <header className="no-print flex items-center justify-between gap-8 px-6 py-4 border-b border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#0B1016]">
        <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0 font-display">
          Teiscomysterics
        </span>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
          {navItems.map((item) => {
            const active = activeNavId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'border-emerald-500 text-slate-900 dark:text-white'
                    : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#121923] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Uitloggen</span>
          </button>
        </div>
      </header>

      {/* Workspace Sub-Toolbar (Role Switcher + Theme Toggle + Identity) */}
      <div className="no-print border-b border-slate-200 dark:border-slate-800/80 bg-slate-100/70 dark:bg-[#0A0F15] px-6 py-2.5">
        <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
            {authUser.role === 'admin' ? (
              <Shield className="w-3.5 h-3.5 text-emerald-500" />
            ) : (
              <User className="w-3.5 h-3.5 text-sky-500" />
            )}
            <span className="font-mono font-semibold text-slate-900 dark:text-slate-200">
              {authUser.username}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {authUser.role === 'admin'
                ? 'Beheerder / Case Bouwer'
                : 'Rechercheur / Speler'}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {authUser.role === 'admin' && (
              <div className="flex items-center gap-1 p-0.5 rounded-lg bg-white dark:bg-[#0F151D] border border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setViewMode('maker');
                    writeStoredSetting('teiscomysterics_view_mode', 'maker');
                  }}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    viewMode === 'maker'
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Bouwer Versie
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setViewMode('player');
                    writeStoredSetting('teiscomysterics_view_mode', 'player');
                  }}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    viewMode === 'player'
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Speler Versie
                </button>
              </div>
            )}

            {accountMeta.email &&
              !isSyntheticUsernameEmail(accountMeta.email) &&
              !accountMeta.hasPasswordProvider && (
                <button
                  type="button"
                  onClick={() => {
                    setLinkPasswordMsg(null);
                    setLinkPasswordValue('');
                    setLinkPasswordConfirm('');
                    setShowLinkPasswordModal(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F151D] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
                >
                  <KeyRound className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Wachtwoord instellen</span>
                </button>
              )}

            <button
              type="button"
              onClick={toggleTheme}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F151D] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
            >
              {theme === 'dark' ? (
                <>
                  <Sun className="w-3.5 h-3.5" />
                  <span>Lichte modus</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5" />
                  <span>Donkere modus</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Strip */}
        <div className="flex md:hidden items-center gap-1 overflow-x-auto pt-2.5 mt-2 border-t border-slate-200 dark:border-slate-800">
          {navItems.map((item) => {
            const active = activeNavId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {accountMeta.email === 'teisco181@gmail.com' &&
        !accountMeta.emailVerified &&
        authUser.role !== 'admin' && (
          <div className="no-print border-b border-amber-500/40 bg-amber-500/10 px-6 py-2.5">
            <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-3 text-xs text-amber-900 dark:text-amber-200">
              <span>
                Beheerdersrechten vereisen een geverifieerd e-mailadres. Klik op de link in je
                verificatiemail (of log eenmalig in met Google) en herlaad de pagina.
                {verificationMsg ? ` — ${verificationMsg}` : ''}
              </span>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await sendVerificationForCurrentUser();
                    setVerificationMsg('Verificatiemail verzonden.');
                  } catch (err) {
                    setVerificationMsg(
                      err instanceof Error ? err.message : 'Verzenden mislukt.'
                    );
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-500 text-white"
              >
                <MailCheck className="w-3.5 h-3.5" />
                <span>Verificatiemail sturen</span>
              </button>
            </div>
          </div>
        )}

      {/* Main Content Viewport */}
      <main className="no-print flex-1 w-full max-w-[1440px] mx-auto px-4 sm:px-6 py-6">
        {loadingData ? (
          <div className="space-y-4">
            <div className="h-16 rounded-xl bg-slate-200 dark:bg-slate-800/50 animate-pulse" />
            <div className="h-72 rounded-xl bg-slate-200 dark:bg-slate-800/50 animate-pulse" />
          </div>
        ) : loadError ? (
          <div className="p-8 rounded-xl border border-rose-500/40 bg-rose-500/10 text-center space-y-3">
            <p className="text-sm text-rose-700 dark:text-rose-300">{loadError}</p>
            <button
              type="button"
              onClick={() => setReloadNonce((n) => n + 1)}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 text-white"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Opnieuw laden</span>
            </button>
          </div>
        ) : !draftCase && authUser.role === 'player' ? (
          <PlayerCodeGate
            username={authUser.username}
            onRedeemCode={handleRedeemCode}
            onUnlocked={handleUnlockedCase}
          />
        ) : !draftCase ? (
          <div className="p-12 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F151D] text-center space-y-3">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Geen dossiers beschikbaar
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Maak een nieuw dossier aan in de Bouwer Versie of start vanuit een Community.
            </p>
            <button
              type="button"
              onClick={handleCreateCase}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 text-white"
            >
              Nieuw dossier aanmaken
            </button>
          </div>
        ) : authUser.role === 'admin' && viewMode === 'maker' ? (
          <MakerStudio
            activeTab={makerTab}
            onChangeTab={setMakerTab}
            cases={cases}
            activeCase={draftCase}
            onSelectCase={handleSelectCase}
            onUpdateDraft={handleUpdateDraft}
            onSaveCase={handleSaveCase}
            onCreateCase={handleCreateCase}
            onDeleteCase={handleDeleteCase}
            onOpenPrintDossier={async () => {
              if (isDirty) {
                await handleSaveCase();
              }
              setShowPrintModal(true);
            }}
            isDirty={isDirty}
            isSaving={isSavingCase}
            saveMessage={saveMessage}
            mapTemplates={mapTemplates}
            onSaveNewMapTemplate={handleSaveNewMapTemplate}
            onUpdateMapTemplate={handleUpdateMapTemplate}
            onApplyMapTemplate={handleApplyMapTemplate}
            onDeleteMapTemplate={handleDeleteMapTemplate}
            communities={communities}
            onSaveNewCommunity={handleSaveNewCommunity}
            onUpdateCommunity={handleUpdateCommunity}
            onApplyCommunity={handleApplyCommunity}
            onCreateCaseFromCommunity={handleCreateCaseFromCommunity}
            onDeleteCommunity={handleDeleteCommunity}
            onExportBackup={() => ({
              version: 1,
              exportedAt: new Date().toISOString(),
              theme,
              cases,
              mapTemplates,
              communities,
            })}
            onImportBackup={async (bundle: BackupBundle) => {
              const summary = await importBackupToFirestore(bundle, authUser.id);
              if (bundle.theme === 'dark' || bundle.theme === 'light') {
                setTheme(bundle.theme);
              }
              return summary;
            }}
          />
        ) : (
          <PlayerPortal
            activeTab={playerTab}
            onChangeTab={setPlayerTab}
            cases={cases.filter((c) => c.status === 'published')}
            activeCase={draftCase}
            onSelectCase={handleSelectCase}
            onRedeemCode={
              authUser.role === 'player'
                ? async (code: string) => {
                    await handleRedeemCode(code);
                  }
                : undefined
            }
            note={note ?? EMPTY_NOTE(draftCase.id, authUser.id)}
            onUpdateNote={setNote}
            onSaveNote={handleSaveNote}
            isSavingNote={isSavingNote}
            noteSaveMessage={noteSaveMessage}
          />
        )}
      </main>

      {showPrintModal && draftCase && (
        <PrintableDossierModal
          caseFile={draftCase}
          onClose={() => setShowPrintModal(false)}
        />
      )}

      {showLinkPasswordModal && accountMeta.email && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F151D] p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-emerald-500" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Wachtwoord koppelen aan je account
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowLinkPasswordModal(false)}
                aria-label="Sluit venster"
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Stel een wachtwoord in voor <strong className="text-slate-800 dark:text-slate-200">{accountMeta.email}</strong>. Daarna kun je voortaan inloggen met zowel e-mail + wachtwoord als Google op hetzelfde account.
            </p>

            {linkPasswordMsg && (
              <div className="p-2.5 rounded-lg border border-sky-500/40 bg-sky-500/10 text-xs text-sky-700 dark:text-sky-300">
                {linkPasswordMsg}
              </div>
            )}

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setLinkPasswordMsg(null);
                if (linkPasswordValue !== linkPasswordConfirm) {
                  setLinkPasswordMsg('De twee wachtwoorden komen niet overeen.');
                  return;
                }
                setLinkPasswordBusy(true);
                try {
                  await linkPasswordToCurrentAccount(linkPasswordValue);
                  setAccountMeta((prev) => ({ ...prev, hasPasswordProvider: true }));
                  setShowLinkPasswordModal(false);
                } catch (err) {
                  setLinkPasswordMsg(
                    err instanceof Error ? err.message : 'Wachtwoord instellen mislukt.'
                  );
                } finally {
                  setLinkPasswordBusy(false);
                }
              }}
              className="space-y-3"
            >
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Nieuw wachtwoord (min. 6 tekens)
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={linkPasswordValue}
                  onChange={(e) => setLinkPasswordValue(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090D12]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Herhaal wachtwoord
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={linkPasswordConfirm}
                  onChange={(e) => setLinkPasswordConfirm(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090D12]"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowLinkPasswordModal(false)}
                  className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700"
                >
                  Annuleren
                </button>
                <button
                  type="submit"
                  disabled={linkPasswordBusy}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white"
                >
                  {linkPasswordBusy ? 'Opslaan...' : 'Wachtwoord opslaan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
