import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LogOut, Moon, RefreshCw, Shield, Sun, User } from 'lucide-react';
import { api } from './api.ts';
import { AuthPortal } from './components/AuthPortal.tsx';
import { MakerStudio, type MakerTab } from './components/MakerStudio.tsx';
import { PlayerCodeGate } from './components/PlayerCodeGate.tsx';
import { PlayerPortal, type PlayerTab } from './components/PlayerPortal.tsx';
import { PrintableDossierModal } from './components/PrintableDossierModal.tsx';
import type {
  AuthStatus,
  AuthUser,
  CaseFile,
  MapTemplate,
  PlayerNote,
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

export default function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [authStatus, setAuthStatus] = useState<AuthStatus>({
    adminClaimed: false,
    hasEnvAdminPasscode: false,
  });
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);

  // Admin can preview as player without logging out
  const [viewMode, setViewMode] = useState<'maker' | 'player'>('player');
  const [makerTab, setMakerTab] = useState<MakerTab>('dossier');
  const [playerTab, setPlayerTab] = useState<PlayerTab>('overzicht');

  const [cases, setCases] = useState<CaseFile[]>([]);
  const [mapTemplates, setMapTemplates] = useState<MapTemplate[]>([]);
  const [activeCaseId, setActiveCaseId] = useState<string>('');
  const [draftCase, setDraftCase] = useState<CaseFile | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isSavingCase, setIsSavingCase] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const [note, setNote] = useState<PlayerNote | null>(null);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [noteSaveMessage, setNoteSaveMessage] = useState<string | null>(null);

  const [loadingData, setLoadingData] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
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

  // Sync Tailwind v4 `.dark` class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  useEffect(() => {
    api
      .getAuthStatus()
      .then(setAuthStatus)
      .catch(() => {
        // Ignore transient status fetch failure
      });
  }, []);

  const loadCases = useCallback(async (authToken: string, preferredId?: string) => {
    setLoadingData(true);
    setLoadError(null);
    try {
      const res = await api.listCases(authToken);
      setCases(res.cases);
      const target =
        res.cases.find((c) => c.id === preferredId) ?? res.cases[0] ?? null;
      if (target) {
        setActiveCaseId(target.id);
        setDraftCase(target);
        setIsDirty(false);
      } else {
        setActiveCaseId('');
        setDraftCase(null);
      }
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : 'Kon dossiers niet laden.'
      );
    } finally {
      setLoadingData(false);
    }
  }, []);

  const handleAuthenticated = async (user: AuthUser, nextToken: string) => {
    setAuthUser(user);
    setToken(nextToken);
    setViewMode(user.role === 'admin' ? 'maker' : 'player');
    await loadCases(nextToken);
    if (user.role === 'admin') {
      api
        .listMaps(nextToken)
        .then((res) => setMapTemplates(res.maps))
        .catch(() => {});
    }
  };

  const handleLogout = () => {
    setAuthUser(null);
    setToken(null);
    setCases([]);
    setMapTemplates([]);
    setDraftCase(null);
    setNote(null);
    setIsDirty(false);
    api.getAuthStatus().then(setAuthStatus).catch(() => {});
  };

  // Load player notes whenever active case changes
  useEffect(() => {
    if (!token || !authUser || !activeCaseId) return;
    let cancelled = false;
    api
      .getNotes(token, activeCaseId)
      .then((res) => {
        if (!cancelled) setNote(res.note);
      })
      .catch(() => {
        if (!cancelled) setNote(EMPTY_NOTE(activeCaseId, authUser.id));
      });
    return () => {
      cancelled = true;
    };
  }, [token, authUser, activeCaseId]);

  const handleSelectCase = (caseId: string) => {
    const found = cases.find((c) => c.id === caseId);
    if (!found) return;
    draftVersionRef.current += 1;
    setActiveCaseId(found.id);
    setDraftCase(found);
    setIsDirty(false);
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
      if (!token || !target || isSavingRef.current) return;
      const versionAtStart = draftVersionRef.current;
      const targetId = target.id;

      isSavingRef.current = true;
      setIsSavingCase(true);
      if (!options?.auto) {
        setSaveMessage(null);
      }
      try {
        const res = await api.updateCase(token, target.id, target);
        setCases((prev) =>
          prev.map((c) => (c.id === res.caseFile.id ? res.caseFile : c))
        );
        // Only overwrite draftCase if the user did not edit or switch cases while saving
        if (
          draftVersionRef.current === versionAtStart &&
          activeCaseIdRef.current === targetId
        ) {
          setDraftCase(res.caseFile);
          latestDraftRef.current = res.caseFile;
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
    [token]
  );

  // Auto-save active dossier every 5 seconds while editing in Maker mode
  useEffect(() => {
    if (!token || authUser?.role !== 'admin' || viewMode !== 'maker') return;
    const intervalId = window.setInterval(() => {
      if (!isDirtyRef.current || isSavingRef.current) return;
      const current = latestDraftRef.current;
      if (!current) return;
      void handleSaveCase(current, { auto: true });
    }, 5000);
    return () => window.clearInterval(intervalId);
  }, [token, authUser?.role, viewMode, handleSaveCase]);

  const handleCreateCase = async () => {
    if (!token) return;
    setIsSavingCase(true);
    try {
      const firstMap = mapTemplates[0];
      const res = await api.createCase(token, {
        title: `Nieuw Mysterie ${cases.length + 1}`,
        townName: firstMap?.townName ?? 'Nieuw Dorp',
        subtitle: 'Onopgeloste zaak',
        status: 'published',
        mapCols: firstMap?.mapCols ?? 24,
        mapRows: firstMap?.mapRows ?? 14,
        terrain: firstMap ? [...firstMap.terrain] : undefined,
        locations: firstMap ? firstMap.locations.map((l) => ({ ...l })) : [],
      });
      setCases((prev) => [...prev, res.caseFile]);
      setActiveCaseId(res.caseFile.id);
      setDraftCase(res.caseFile);
      setIsDirty(false);
      setMakerTab('dossier');
    } finally {
      setIsSavingCase(false);
    }
  };

  const handleDeleteCase = async (caseId: string) => {
    if (!token) return;
    await api.deleteCase(token, caseId);
    const remaining = cases.filter((c) => c.id !== caseId);
    setCases(remaining);
    const next = remaining[0] ?? null;
    setActiveCaseId(next?.id ?? '');
    setDraftCase(next);
    setIsDirty(false);
  };

  const handleSaveNewMapTemplate = async (name: string) => {
    if (!token || !draftCase) return;
    const res = await api.createMap(token, {
      name,
      townName: draftCase.townName,
      mapCols: draftCase.mapCols,
      mapRows: draftCase.mapRows,
      terrain: [...draftCase.terrain],
      locations: draftCase.locations.map((l) => ({ ...l })),
    });
    setMapTemplates((prev) => [...prev, res.mapTemplate]);
  };

  const handleUpdateMapTemplate = async (mapId: string) => {
    if (!token || !draftCase) return;
    const res = await api.updateMap(token, mapId, {
      townName: draftCase.townName,
      mapCols: draftCase.mapCols,
      mapRows: draftCase.mapRows,
      terrain: [...draftCase.terrain],
      locations: draftCase.locations.map((l) => ({ ...l })),
    });
    setMapTemplates((prev) =>
      prev.map((m) => (m.id === res.mapTemplate.id ? res.mapTemplate : m))
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
    if (!token) return;
    await api.deleteMap(token, mapId);
    setMapTemplates((prev) => prev.filter((m) => m.id !== mapId));
  };

  const handleSaveNote = async () => {
    if (!token || !activeCaseId || !note) return;
    setIsSavingNote(true);
    setNoteSaveMessage(null);
    try {
      const res = await api.saveNotes(token, activeCaseId, note);
      setNote(res.note);
      setNoteSaveMessage('Aantekeningen opgeslagen');
      setTimeout(() => setNoteSaveMessage(null), 3000);
    } finally {
      setIsSavingNote(false);
    }
  };

  const handleUnlockedCase = (unlocked: CaseFile) => {
    setCases((prev) => {
      const exists = prev.some((c) => c.id === unlocked.id);
      return exists ? prev.map((c) => (c.id === unlocked.id ? unlocked : c)) : [...prev, unlocked];
    });
    setActiveCaseId(unlocked.id);
    setDraftCase(unlocked);
    setIsDirty(false);
    setPlayerTab('overzicht');
  };

  const handleRedeemCode = async (code: string) => {
    if (!token) return;
    const res = await api.redeemCaseCode(token, code);
    handleUnlockedCase(res.caseFile);
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

  if (!authUser || !token) {
    return (
      <AuthPortal
        authStatus={authStatus}
        theme={theme}
        onToggleTheme={toggleTheme}
        onAuthenticated={handleAuthenticated}
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
                  onClick={() => setViewMode('maker')}
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
                  onClick={() => setViewMode('player')}
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
              onClick={() => loadCases(token, activeCaseId)}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 text-white"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Opnieuw laden</span>
            </button>
          </div>
        ) : !draftCase && authUser.role === 'player' ? (
          <PlayerCodeGate
            token={token}
            username={authUser.username}
            onUnlocked={handleUnlockedCase}
          />
        ) : !draftCase ? (
          <div className="p-12 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F151D] text-center space-y-3">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Geen gepubliceerde dossiers beschikbaar
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Maak een nieuw dossier aan in de Bouwer Versie of publiceer een bestaand dossier.
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
          />
        ) : (
          <PlayerPortal
            activeTab={playerTab}
            onChangeTab={setPlayerTab}
            cases={cases.filter((c) => c.status === 'published')}
            activeCase={draftCase}
            onSelectCase={handleSelectCase}
            onRedeemCode={authUser.role === 'player' ? handleRedeemCode : undefined}
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
    </div>
  );
}
