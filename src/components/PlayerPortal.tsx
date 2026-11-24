import React, { useMemo, useState } from 'react';
import {
  BookmarkPlus,
  Briefcase,
  CheckCircle2,
  Eraser,
  FileText,
  Fingerprint,
  KeyRound,
  Layers,
  MapPin,
  Package,
  Pencil,
  RotateCcw,
  Save,
  ScanSearch,
  Search,
  SplitSquareHorizontal,
  Trash2,
  UserCheck,
} from 'lucide-react';
import type {
  CaseFile,
  EvidenceItem,
  Person,
  PersonStatus,
  PlayerNote,
  SuspectMark,
} from '../types.ts';
import {
  cloneMatrix,
  compareFingerprints,
  createEmptyMatrix,
} from '../utils/fingerprint.ts';
import { resolveAssetUrl } from '../utils/assetUrl.ts';
import {
  resolvePersonHomeLocation,
  resolvePersonWorkLocation,
} from '../utils/personImport.ts';
import { FingerprintGrid } from './FingerprintGrid.tsx';
import { PersonAvatar } from './PersonAvatar.tsx';
import { TownMapView } from './TownMapView.tsx';

export type PlayerTab =
  | 'overzicht'
  | 'kaart'
  | 'personen'
  | 'vergelijker'
  | 'aantekeningen';

interface PlayerPortalProps {
  activeTab: PlayerTab;
  onChangeTab: (tab: PlayerTab) => void;
  cases: CaseFile[];
  activeCase: CaseFile;
  onSelectCase: (caseId: string) => void;
  onRedeemCode?: (code: string) => Promise<void>;
  note: PlayerNote;
  onUpdateNote: (next: PlayerNote) => void;
  onSaveNote: () => Promise<void>;
  isSavingNote: boolean;
  noteSaveMessage: string | null;
}

export const PlayerPortal: React.FC<PlayerPortalProps> = ({
  activeTab,
  onChangeTab,
  cases,
  activeCase,
  onSelectCase,
  onRedeemCode,
  note,
  onUpdateNote,
  onSaveNote,
  isSavingNote,
  noteSaveMessage,
}) => {
  const [personSearch, setPersonSearch] = useState('');
  const [personFilter, setPersonFilter] = useState<PersonStatus | 'all'>('all');
  const [selectedPersonId, setSelectedPersonId] = useState<string>(
    activeCase.persons[0]?.id ?? ''
  );
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string>(
    activeCase.evidence[0]?.id ?? ''
  );
  const [showAddCode, setShowAddCode] = useState(false);
  const [newCaseCode, setNewCaseCode] = useState('');
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [redeeming, setRedeeming] = useState(false);
  const [focusMapLocationId, setFocusMapLocationId] = useState<string | null>(null);

  // Fingerprint Comparator state
  const allEvidenceStamps = useMemo(
    () =>
      activeCase.evidence.flatMap((ev) =>
        ev.stamps.map((stamp) => ({
          id: stamp.id,
          label: `${stamp.label} (${ev.code} — ${ev.title})`,
          matrix: stamp.matrix,
          source: 'evidence' as const,
        }))
      ),
    [activeCase.evidence]
  );

  const [traceMode, setTraceMode] = useState<'preset' | 'manual'>(
    allEvidenceStamps.length > 0 ? 'preset' : 'manual'
  );
  const [selectedTraceId, setSelectedTraceId] = useState<string>(
    allEvidenceStamps[0]?.id ?? ''
  );
  const [manualMatrix, setManualMatrix] = useState<number[]>(() =>
    createEmptyMatrix()
  );
  const [manualBrush, setManualBrush] = useState<'ridge' | 'erase'>('ridge');
  const [manualTraceName, setManualTraceName] = useState('');
  const [comparePersonId, setComparePersonId] = useState<string>(
    activeCase.persons[0]?.id ?? ''
  );
  const [overlayMode, setOverlayMode] = useState<'split' | 'overlay'>('split');

  const selectedPerson = useMemo(
    () =>
      activeCase.persons.find((p) => p.id === selectedPersonId) ??
      activeCase.persons[0] ??
      null,
    [activeCase.persons, selectedPersonId]
  );

  const selectedEvidence = useMemo(
    () =>
      activeCase.evidence.find((e) => e.id === selectedEvidenceId) ??
      activeCase.evidence[0] ??
      null,
    [activeCase.evidence, selectedEvidenceId]
  );

  const filteredPersons = useMemo(() => {
    const q = personSearch.trim().toLowerCase();
    return activeCase.persons.filter((p) => {
      if (personFilter !== 'all' && p.status !== personFilter) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.alias.toLowerCase().includes(q) ||
        p.occupation.toLowerCase().includes(q) ||
        p.address.toLowerCase().includes(q) ||
        p.fingerprintCode.toLowerCase().includes(q)
      );
    });
  }, [activeCase.persons, personSearch, personFilter]);

  const activeTraceMatrix = useMemo(() => {
    if (traceMode === 'manual') return manualMatrix;
    const fromEv = allEvidenceStamps.find((s) => s.id === selectedTraceId);
    if (fromEv) return fromEv.matrix;
    const fromCustom = note.customTraces.find((t) => t.id === selectedTraceId);
    if (fromCustom) return fromCustom.matrix;
    return createEmptyMatrix();
  }, [traceMode, manualMatrix, allEvidenceStamps, selectedTraceId, note.customTraces]);

  const comparePerson = useMemo(
    () =>
      activeCase.persons.find((p) => p.id === comparePersonId) ??
      activeCase.persons[0] ??
      null,
    [activeCase.persons, comparePersonId]
  );

  const rankedMatches = useMemo(() => {
    return activeCase.persons
      .map((p) => ({
        person: p,
        stats: compareFingerprints(activeTraceMatrix, p.fingerprint),
      }))
      .sort((a, b) => b.stats.overlapScore - a.stats.overlapScore);
  }, [activeCase.persons, activeTraceMatrix]);

  const activeComparison = useMemo(() => {
    if (!comparePerson) return null;
    return compareFingerprints(activeTraceMatrix, comparePerson.fingerprint);
  }, [activeTraceMatrix, comparePerson]);

  const setSuspectMark = (personId: string, mark: SuspectMark) => {
    onUpdateNote({
      ...note,
      suspectMarks: {
        ...note.suspectMarks,
        [personId]: mark,
      },
    });
  };

  const togglePinnedClue = (clueLabel: string) => {
    const exists = note.pinnedClues.includes(clueLabel);
    onUpdateNote({
      ...note,
      pinnedClues: exists
        ? note.pinnedClues.filter((c) => c !== clueLabel)
        : [...note.pinnedClues, clueLabel],
    });
  };

  const saveManualTrace = () => {
    const label =
      manualTraceName.trim() || `Dossierspoor ${note.customTraces.length + 1}`;
    const newTrace = {
      id: `trace-${Date.now().toString(36)}`,
      label,
      matrix: cloneMatrix(manualMatrix),
    };
    onUpdateNote({
      ...note,
      customTraces: [...note.customTraces, newTrace],
    });
    setManualTraceName('');
    setSelectedTraceId(newTrace.id);
    setTraceMode('preset');
  };

  const openStampInComparator = (stampId: string) => {
    setTraceMode('preset');
    setSelectedTraceId(stampId);
    onChangeTab('vergelijker');
  };

  const totalStamps = activeCase.evidence.reduce(
    (sum, ev) => sum + ev.stamps.length,
    0
  );

  return (
    <div className="space-y-6">
      {/* Case Context Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F151D]">
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="player-case-select" className="sr-only">
            Kies politiedossier
          </label>
          <select
            id="player-case-select"
            value={activeCase.id}
            onChange={(e) => onSelectCase(e.target.value)}
            className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090D12] text-slate-900 dark:text-white"
          >
            {cases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} — {c.title}
              </option>
            ))}
          </select>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Plaats: {activeCase.townName} · {activeCase.subtitle}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {onRedeemCode && !showAddCode && (
            <button
              type="button"
              onClick={() => {
                setShowAddCode(true);
                setRedeemError(null);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              <KeyRound className="w-3.5 h-3.5 text-emerald-500" />
              <span>Code toevoegen</span>
            </button>
          )}

          {onRedeemCode && showAddCode && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setRedeemError(null);
                if (!newCaseCode.trim()) return;
                setRedeeming(true);
                try {
                  await onRedeemCode(newCaseCode.trim());
                  setNewCaseCode('');
                  setShowAddCode(false);
                } catch (err) {
                  setRedeemError(
                    err instanceof Error ? err.message : 'Ongeldige code.'
                  );
                } finally {
                  setRedeeming(false);
                }
              }}
              className="flex flex-wrap items-center gap-2"
            >
              <input
                type="text"
                value={newCaseCode}
                onChange={(e) => setNewCaseCode(e.target.value.toUpperCase())}
                placeholder="Dossiercode..."
                className="w-32 px-2.5 py-1.5 text-xs font-mono uppercase rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090D12]"
              />
              <button
                type="submit"
                disabled={redeeming}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-sky-600 hover:bg-sky-500 text-white"
              >
                {redeeming ? '...' : 'Toevoegen'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddCode(false);
                  setRedeemError(null);
                }}
                className="px-2 py-1.5 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white"
              >
                Annuleren
              </button>
              {redeemError && (
                <span className="text-xs text-rose-500">{redeemError}</span>
              )}
            </form>
          )}

          {noteSaveMessage && (
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
              {noteSaveMessage}
            </span>
          )}
          <button
            type="button"
            onClick={onSaveNote}
            disabled={isSavingNote}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white transition-colors whitespace-nowrap shrink-0"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSavingNote ? 'Opslaan...' : 'Aantekeningen opslaan'}</span>
          </button>
        </div>
      </div>

      {/* TAB 1: OVERZICHT & BEWIJSKLUIS */}
      {activeTab === 'overzicht' && (
        <div className="space-y-6">
          {/* Briefing Hero */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            <div className="lg:col-span-8 p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F151D] flex flex-col justify-between space-y-5">
              <div>
                <div className="font-mono text-xs text-emerald-600 dark:text-emerald-400">
                  {activeCase.code} · {activeCase.townName}
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mt-1 text-balance">
                  {activeCase.title}
                </h1>
                <p className="mt-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line">
                  {activeCase.briefing}
                </p>
              </div>

              {activeCase.printedDossierGuide && (
                <div className="p-4 rounded-lg border border-sky-500/30 bg-sky-500/5 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                  <strong className="text-slate-900 dark:text-white">
                    Papieren Dossier Hulp:
                  </strong>{' '}
                  {activeCase.printedDossierGuide}
                </div>
              )}
            </div>

            <div className="lg:col-span-4 p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F151D] flex flex-col justify-between space-y-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  Onderzoeksinstrumenten
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Combineer de gegevens uit uw uitgeprinte dossier met dit digitale archief.
                </p>
              </div>

              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={() => onChangeTab('kaart')}
                  className="w-full flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-emerald-500 bg-slate-50 dark:bg-[#090D12] text-left transition-colors"
                >
                  <span className="text-xs font-semibold">Dorpskaart verkennen</span>
                  <span className="font-mono text-xs text-emerald-600 dark:text-emerald-400">
                    {activeCase.locations.length} locaties
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onChangeTab('personen')}
                  className="w-full flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-emerald-500 bg-slate-50 dark:bg-[#090D12] text-left transition-colors"
                >
                  <span className="text-xs font-semibold">Burger- &amp; Verdachtenregister</span>
                  <span className="font-mono text-xs text-emerald-600 dark:text-emerald-400">
                    {activeCase.persons.length} personen
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onChangeTab('vergelijker')}
                  className="w-full flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-emerald-500 bg-slate-50 dark:bg-[#090D12] text-left transition-colors"
                >
                  <span className="text-xs font-semibold">Vingerafdruk Vergelijker</span>
                  <span className="font-mono text-xs text-emerald-600 dark:text-emerald-400">
                    {totalStamps} sporen
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onChangeTab('aantekeningen')}
                  className="w-full flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-emerald-500 bg-slate-50 dark:bg-[#090D12] text-left transition-colors"
                >
                  <span className="text-xs font-semibold">Mijn Aantekeningen</span>
                  <span className="font-mono text-xs text-emerald-600 dark:text-emerald-400">
                    {note.pinnedClues.length} vastgepind
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* 4-column summary metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F151D]">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Geregistreerde locaties
              </div>
              <div className="text-2xl font-mono font-bold text-slate-900 dark:text-white mt-1">
                {activeCase.locations.length}
              </div>
            </div>
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F151D]">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Betrokken personen
              </div>
              <div className="text-2xl font-mono font-bold text-slate-900 dark:text-white mt-1">
                {activeCase.persons.length}
              </div>
            </div>
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F151D]">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Bewijsstukken in kluis
              </div>
              <div className="text-2xl font-mono font-bold text-slate-900 dark:text-white mt-1">
                {activeCase.evidence.length}
              </div>
            </div>
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F151D]">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Gelichte vingerafdrukken
              </div>
              <div className="text-2xl font-mono font-bold text-slate-900 dark:text-white mt-1">
                {totalStamps}
              </div>
            </div>
          </div>

          {/* Evidence Vault Inspector */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-5 p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F151D] space-y-3">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                02. Bewijskluis ({activeCase.evidence.length})
              </h2>
              <div className="space-y-2">
                {activeCase.evidence.map((ev) => (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => setSelectedEvidenceId(ev.id)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      selectedEvidence?.id === ev.id
                        ? 'border-emerald-500 bg-emerald-500/10'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090D12] hover:border-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-emerald-600 dark:text-emerald-400">
                        {ev.code} · {ev.category}
                      </span>
                      <span className="text-[11px] font-mono text-slate-500">
                        {ev.stamps.length} spoor(en)
                      </span>
                    </div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-white mt-0.5">
                      {ev.title}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      Vindplaats: {ev.foundAtLabel}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="lg:col-span-7 p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F151D]">
              {!selectedEvidence ? (
                <div className="py-12 text-center text-sm text-slate-500">
                  Geen bewijsstuk geselecteerd.
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-start justify-between gap-4 pb-3 border-b border-slate-200 dark:border-slate-800">
                    <div>
                      <div className="font-mono text-xs text-emerald-600 dark:text-emerald-400">
                        {selectedEvidence.code} · {selectedEvidence.foundAtLabel}
                      </div>
                      <h3 className="text-xl font-bold text-slate-900 dark:text-white mt-0.5">
                        {selectedEvidence.title}
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        togglePinnedClue(
                          `${selectedEvidence.code}: ${selectedEvidence.title}`
                        )
                      }
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                        note.pinnedClues.includes(
                          `${selectedEvidence.code}: ${selectedEvidence.title}`
                        )
                          ? 'bg-emerald-600 text-white border-emerald-500'
                          : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <BookmarkPlus className="w-3.5 h-3.5" />
                      <span>
                        {note.pinnedClues.includes(
                          `${selectedEvidence.code}: ${selectedEvidence.title}`
                        )
                          ? 'Vastgepind'
                          : 'Aanwijzing bewaren'}
                      </span>
                    </button>
                  </div>

                  {/* Interactive Evidence Visual Card with Stamped Prints */}
                  <div className="relative h-56 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-[#090D12] overflow-hidden forensic-grid-bg">
                    {selectedEvidence.imageUrl ? (
                      <img
                        src={resolveAssetUrl(selectedEvidence.imageUrl)}
                        alt={selectedEvidence.title}
                        referrerPolicy="no-referrer"
                        className="absolute inset-0 w-full h-full object-cover opacity-60"
                      />
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 dark:text-slate-600">
                        {selectedEvidence.category === 'document' ? (
                          <FileText className="w-12 h-12 mb-1 opacity-40" />
                        ) : (
                          <Package className="w-12 h-12 mb-1 opacity-40" />
                        )}
                        <span className="font-mono text-xs">{selectedEvidence.code}</span>
                      </div>
                    )}

                    {selectedEvidence.stamps.map((stamp) => (
                      <button
                        key={stamp.id}
                        type="button"
                        onClick={() => openStampInComparator(stamp.id)}
                        style={{
                          left: `${stamp.x}%`,
                          top: `${stamp.y}%`,
                          transform: `translate(-50%, -50%) rotate(${stamp.rotation}deg)`,
                        }}
                        className="absolute p-1 rounded border border-emerald-400/80 bg-black/50 hover:bg-emerald-950/90 transition-all group"
                        title="Klik om dit spoor in de Vergelijker te openen"
                      >
                        <FingerprintGrid matrix={stamp.matrix} cellSize={3} />
                        <span className="block text-[9px] font-mono text-emerald-300 mt-0.5 whitespace-nowrap">
                          {stamp.label}
                        </span>
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Omschrijving
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                        {selectedEvidence.description}
                      </p>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Forensisch verslag
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                        {selectedEvidence.forensicReport}
                      </p>
                    </div>
                  </div>

                  {selectedEvidence.stamps.length > 0 && (
                    <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                      <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Aangetroffen vingerafdruksporen
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {selectedEvidence.stamps.map((st) => (
                          <button
                            key={st.id}
                            type="button"
                            onClick={() => openStampInComparator(st.id)}
                            className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 transition-colors"
                          >
                            <Fingerprint className="w-4 h-4" />
                            <span>{st.label} vergelijken</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: DORPSKAART */}
      {activeTab === 'kaart' && (
        <TownMapView
          caseFile={activeCase}
          editable={false}
          focusLocationId={focusMapLocationId}
          onSelectPerson={(p: Person) => {
            setSelectedPersonId(p.id);
            onChangeTab('personen');
          }}
          onSelectEvidence={(ev: EvidenceItem) => {
            setSelectedEvidenceId(ev.id);
            onChangeTab('overzicht');
          }}
        />
      )}

      {/* TAB 3: PERSONENREGISTER */}
      {activeTab === 'personen' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-5 p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F151D] space-y-4">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={personSearch}
                onChange={(e) => setPersonSearch(e.target.value)}
                placeholder="Zoek naam, beroep, adres of afdrukcode..."
                className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#090D12]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#090D12] border border-slate-200 dark:border-slate-800">
              {(['all', 'verdachte', 'getuige', 'slachtoffer', 'burger'] as const).map(
                (st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setPersonFilter(st)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors capitalize ${
                      personFilter === st
                        ? 'bg-white dark:bg-[#17202B] text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {st === 'all' ? 'Allen' : st}
                  </button>
                )
              )}
            </div>

            <div className="space-y-2">
              {filteredPersons.length === 0 ? (
                <p className="text-xs text-slate-500 py-8 text-center">
                  Geen personen gevonden voor deze zoekopdracht.
                </p>
              ) : (
                filteredPersons.map((p) => {
                  const mark = note.suspectMarks[p.id];
                  const workLoc = resolvePersonWorkLocation(p, activeCase.locations ?? []);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedPersonId(p.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ${
                        selectedPerson?.id === p.id
                          ? 'border-emerald-500 bg-emerald-500/10'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090D12] hover:border-slate-400'
                      }`}
                    >
                      <PersonAvatar src={p.portraitUrl} name={p.name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                            {p.name}
                          </span>
                          {mark && mark !== 'neutraal' && (
                            <span
                              className={`text-[10px] font-mono ${
                                mark === 'verdacht'
                                  ? 'text-rose-500'
                                  : 'text-emerald-500'
                              }`}
                            >
                              {mark === 'verdacht' ? 'Verdacht' : 'Vrijgepleit'}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {p.occupation}
                          {workLoc ? ` (${workLoc.code})` : ''} · {p.address}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="lg:col-span-7 p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F151D]">
            {!selectedPerson ? (
              <div className="py-16 text-center text-sm text-slate-500">
                Selecteer een persoon om het politiedossier in te zien.
              </div>
            ) : (() => {
              const selectedHomeLoc = resolvePersonHomeLocation(
                selectedPerson,
                activeCase.locations ?? []
              );
              const selectedWorkLoc = resolvePersonWorkLocation(
                selectedPerson,
                activeCase.locations ?? []
              );
              return (
              <div className="space-y-6">
                <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-4">
                    <PersonAvatar
                      src={selectedPerson.portraitUrl}
                      name={selectedPerson.name}
                      size="lg"
                    />
                    <div>
                      <div className="font-mono text-xs text-emerald-600 dark:text-emerald-400">
                        {selectedPerson.code} · {selectedPerson.status}
                        {selectedPerson.alias ? ` · "${selectedPerson.alias}"` : ''}
                      </div>
                      <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                        {selectedPerson.name}
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {selectedPerson.age} jaar · {selectedPerson.occupation} ·{' '}
                        {selectedPerson.address}
                      </p>
                      {(selectedHomeLoc || selectedWorkLoc || selectedPerson.workLocationCode) && (
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          {selectedHomeLoc && (
                            <button
                              type="button"
                              onClick={() => {
                                setFocusMapLocationId(selectedHomeLoc.id);
                                onChangeTab('kaart');
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 transition-colors"
                            >
                              <MapPin className="w-3 h-3" />
                              <span>Woont: {selectedHomeLoc.code} — {selectedHomeLoc.name}</span>
                            </button>
                          )}
                          {selectedWorkLoc ? (
                            <button
                              type="button"
                              onClick={() => {
                                setFocusMapLocationId(selectedWorkLoc.id);
                                onChangeTab('kaart');
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md border border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300 hover:bg-sky-500/20 transition-colors"
                            >
                              <Briefcase className="w-3 h-3" />
                              <span>Werkplek: {selectedWorkLoc.code} — {selectedWorkLoc.name}</span>
                            </button>
                          ) : selectedPerson.workLocationCode ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-mono rounded-md border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300">
                              <Briefcase className="w-3 h-3" />
                              <span>Werkgebouw: {selectedPerson.workLocationCode}</span>
                            </span>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setComparePersonId(selectedPerson.id);
                      onChangeTab('vergelijker');
                    }}
                    className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                  >
                    <Fingerprint className="w-4 h-4" />
                    <span>Vingerafdruk vergelijken</span>
                  </button>
                </div>

                {/* Personal Player Suspect Marking */}
                <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-lg bg-slate-50 dark:bg-[#090D12] border border-slate-200 dark:border-slate-800">
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Mijn inschatting in aantekeningen:
                  </span>
                  <div className="flex items-center gap-1 p-1 rounded-lg bg-white dark:bg-[#0F151D] border border-slate-200 dark:border-slate-800">
                    {(
                      [
                        { id: 'verdacht', label: 'Verdacht' },
                        { id: 'neutraal', label: 'Neutraal' },
                        { id: 'vrijgepleit', label: 'Vrijgepleit' },
                      ] as const
                    ).map((opt) => {
                      const active =
                        (note.suspectMarks[selectedPerson.id] ?? 'neutraal') === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setSuspectMark(selectedPerson.id, opt.id)}
                          className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                            active
                              ? opt.id === 'verdacht'
                                ? 'bg-rose-600 text-white'
                                : opt.id === 'vrijgepleit'
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900'
                              : 'text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
                  <div className="md:col-span-7 space-y-4">
                    <div>
                      <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1">
                        Alibi &amp; Verklaring
                      </h3>
                      <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                        {selectedPerson.alibi || 'Geen alibi bekend.'}
                      </p>
                    </div>
                    <div>
                      <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1">
                        Achtergrondinformatie
                      </h3>
                      <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                        {selectedPerson.publicBio || 'Geen aanvullende gegevens.'}
                      </p>
                    </div>
                    <div>
                      <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1">
                        Politie-aantekeningen
                      </h3>
                      <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                        {selectedPerson.policeNotes || 'Geen bijzonderheden genoteerd.'}
                      </p>
                    </div>
                  </div>

                  <div className="md:col-span-5 flex flex-col items-center p-4 rounded-xl bg-slate-50 dark:bg-[#090D12] border border-slate-200 dark:border-slate-800">
                    <div className="text-xs font-mono text-emerald-600 dark:text-emerald-400 mb-2">
                      {selectedPerson.fingerprintCode} · {selectedPerson.fingerprintPattern}
                    </div>
                    <FingerprintGrid
                      matrix={selectedPerson.fingerprint}
                      showCoordinates
                      cellSize={12}
                    />
                  </div>
                </div>
              </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* TAB 4: VINGERAFDRUK VERGELIJKER */}
      {activeTab === 'vergelijker' && (
        <div className="space-y-6">
          {/* Comparator Header Controls */}
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F151D]">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Forensische Vingerafdruk Vergelijker
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Selecteer een spoor uit het dossier of teken een afdruk over vanaf uw papieren
                dossier om deze te matchen met inwoners.
              </p>
            </div>

            <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#090D12] border border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setOverlayMode('split')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  overlayMode === 'split'
                    ? 'bg-white dark:bg-[#17202B] text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <SplitSquareHorizontal className="w-3.5 h-3.5" />
                <span>Naast elkaar</span>
              </button>
              <button
                type="button"
                onClick={() => setOverlayMode('overlay')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  overlayMode === 'overlay'
                    ? 'bg-white dark:bg-[#17202B] text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Over elkaar (Pixel-Diff)</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            {/* LEFT: Trace Input (Evidence Stamp or Manual Paper Dossier Input) */}
            <div className="xl:col-span-5 p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F151D] space-y-4">
              <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#090D12] border border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setTraceMode('preset')}
                  className={`flex-1 py-1.5 px-3 text-xs font-medium rounded-md transition-colors ${
                    traceMode === 'preset'
                      ? 'bg-white dark:bg-[#17202B] text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Spoor uit Bewijskluis
                </button>
                <button
                  type="button"
                  onClick={() => setTraceMode('manual')}
                  className={`flex-1 py-1.5 px-3 text-xs font-medium rounded-md transition-colors ${
                    traceMode === 'manual'
                      ? 'bg-white dark:bg-[#17202B] text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Papieren Dossier Intekenen
                </button>
              </div>

              {traceMode === 'preset' ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                      Kies gevonden spoor of eigen opgeslagen spoor
                    </label>
                    <select
                      value={selectedTraceId}
                      onChange={(e) => setSelectedTraceId(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090D12]"
                    >
                      {allEvidenceStamps.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                      {note.customTraces.map((t) => (
                        <option key={t.id} value={t.id}>
                          Eigen spoor: {t.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex justify-center p-4 rounded-xl bg-slate-50 dark:bg-[#090D12] border border-slate-200 dark:border-slate-800">
                    <FingerprintGrid
                      matrix={activeTraceMatrix}
                      compareMatrix={
                        overlayMode === 'overlay' && comparePerson
                          ? comparePerson.fingerprint
                          : undefined
                      }
                      showCoordinates
                      cellSize={17}
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setManualBrush('ridge')}
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border ${
                          manualBrush === 'ridge'
                            ? 'bg-emerald-600 text-white border-emerald-500'
                            : 'border-slate-300 dark:border-slate-700'
                        }`}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>Teken</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setManualBrush('erase')}
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border ${
                          manualBrush === 'erase'
                            ? 'bg-rose-600 text-white border-rose-500'
                            : 'border-slate-300 dark:border-slate-700'
                        }`}
                      >
                        <Eraser className="w-3.5 h-3.5" />
                        <span>Gum</span>
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setManualMatrix(createEmptyMatrix())}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Wissen</span>
                    </button>
                  </div>

                  <div className="flex justify-center p-4 rounded-xl bg-slate-50 dark:bg-[#090D12] border border-slate-200 dark:border-slate-800">
                    <FingerprintGrid
                      matrix={manualMatrix}
                      compareMatrix={
                        overlayMode === 'overlay' && comparePerson
                          ? comparePerson.fingerprint
                          : undefined
                      }
                      editable
                      brushMode={manualBrush}
                      showCoordinates
                      cellSize={17}
                      onChange={setManualMatrix}
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={manualTraceName}
                      onChange={(e) => setManualTraceName(e.target.value)}
                      placeholder="Naam voor dit spoor (bijv. Dossier p.3)..."
                      className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090D12]"
                    />
                    <button
                      type="button"
                      onClick={saveManualTrace}
                      className="px-3 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white whitespace-nowrap"
                    >
                      Spoor bewaren
                    </button>
                  </div>
                </div>
              )}

              {overlayMode === 'overlay' && (
                <div className="flex flex-wrap items-center justify-center gap-4 text-[11px] text-slate-600 dark:text-slate-400">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500" />
                    Overeenkomst
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-xs bg-rose-500" />
                    Afwijkend in spoor
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-xs bg-sky-500/50" />
                    Alleen bij persoon
                  </span>
                </div>
              )}
            </div>

            {/* RIGHT: Suspect Database & Match Ranking */}
            <div className="xl:col-span-7 space-y-6">
              {comparePerson && activeComparison && (
                <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F151D] grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
                  <div className="md:col-span-6 space-y-3">
                    <div className="flex items-center gap-3">
                      <PersonAvatar
                        src={comparePerson.portraitUrl}
                        name={comparePerson.name}
                        size="md"
                      />
                      <div>
                        <div className="font-mono text-xs text-emerald-600 dark:text-emerald-400">
                          {comparePerson.fingerprintCode} · {comparePerson.fingerprintPattern}
                        </div>
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                          {comparePerson.name}
                        </h3>
                        <p className="text-xs text-slate-500">{comparePerson.occupation}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-2">
                      <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#090D12] border border-slate-200 dark:border-slate-800">
                        <div className="text-[11px] text-slate-500">Overeenkomst</div>
                        <div
                          className={`text-lg font-mono font-bold ${
                            activeComparison.overlapScore >= 75
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : activeComparison.overlapScore >= 45
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {activeComparison.overlapScore}%
                        </div>
                      </div>
                      <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#090D12] border border-slate-200 dark:border-slate-800">
                        <div className="text-[11px] text-slate-500">Match pixels</div>
                        <div className="text-lg font-mono font-bold text-slate-900 dark:text-white">
                          {activeComparison.matchedPixels}/{activeComparison.traceActiveCount}
                        </div>
                      </div>
                      <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#090D12] border border-slate-200 dark:border-slate-800">
                        <div className="text-[11px] text-slate-500">Afwijkingen</div>
                        <div className="text-lg font-mono font-bold text-rose-600 dark:text-rose-400">
                          {activeComparison.extraTracePixels}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="md:col-span-6 flex justify-center p-3 rounded-xl bg-slate-50 dark:bg-[#090D12] border border-slate-200 dark:border-slate-800">
                    <FingerprintGrid
                      matrix={comparePerson.fingerprint}
                      showCoordinates
                      cellSize={14}
                    />
                  </div>
                </div>
              )}

              {/* Automated Ranking List across all citizens */}
              <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F151D] space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <ScanSearch className="w-4 h-4 text-emerald-500" />
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      Automatische Databank-vergelijking
                    </h3>
                  </div>
                  <span className="text-xs font-mono text-slate-500">
                    Gesorteerd op hoogste spoorovereenkomst
                  </span>
                </div>

                <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                  {rankedMatches.map(({ person, stats }) => {
                    const isSelected = comparePerson?.id === person.id;
                    return (
                      <button
                        key={person.id}
                        type="button"
                        onClick={() => setComparePersonId(person.id)}
                        className={`w-full flex items-center justify-between gap-4 p-3 text-left transition-colors ${
                          isSelected
                            ? 'bg-emerald-500/10'
                            : 'bg-white dark:bg-[#0F151D] hover:bg-slate-50 dark:hover:bg-[#141C26]'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <PersonAvatar
                            src={person.portraitUrl}
                            name={person.name}
                            size="sm"
                          />
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                              {person.name}
                            </div>
                            <div className="text-[11px] font-mono text-slate-500">
                              {person.fingerprintCode} · {person.fingerprintPattern}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 shrink-0">
                          <div className="text-right">
                            <div
                              className={`font-mono text-sm font-bold ${
                                stats.overlapScore >= 75
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : stats.overlapScore >= 45
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-slate-500'
                              }`}
                            >
                              {stats.overlapScore}%
                            </div>
                            <div className="text-[10px] font-mono text-slate-500">
                              {stats.matchedPixels} px match
                            </div>
                          </div>
                          <CheckCircle2
                            className={`w-4 h-4 ${
                              isSelected
                                ? 'text-emerald-500'
                                : 'text-slate-300 dark:text-slate-700'
                            }`}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: RECHERCHEUR AANTEKENINGEN */}
      {activeTab === 'aantekeningen' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7 p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F151D] space-y-4">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  Mijn Recherche-aantekeningen
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Persoonlijke notities voor {activeCase.code} — alleen zichtbaar voor uw
                  account.
                </p>
              </div>
              <button
                type="button"
                onClick={onSaveNote}
                disabled={isSavingNote}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSavingNote ? 'Opslaan...' : 'Opslaan'}</span>
              </button>
            </div>

            <textarea
              rows={14}
              value={note.generalNotes}
              onChange={(e) =>
                onUpdateNote({ ...note, generalNotes: e.target.value })
              }
              placeholder="Schrijf hier uw tijdlijn, verbanden tussen adressen, tegenstrijdige alibi's en vingerafdrukmatches..."
              className="w-full px-4 py-3 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090D12] leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="lg:col-span-5 space-y-6">
            {/* Suspect Status Board */}
            <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F151D] space-y-3">
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-emerald-500" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Verdachtenbord
                </h3>
              </div>
              <div className="space-y-2">
                {activeCase.persons.map((p) => {
                  const mark = note.suspectMarks[p.id] ?? 'neutraal';
                  return (
                    <div
                      key={p.id}
                      className="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090D12]"
                    >
                      <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                        {p.name}
                      </span>
                      <select
                        value={mark}
                        onChange={(e) =>
                          setSuspectMark(p.id, e.target.value as SuspectMark)
                        }
                        className="px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F151D]"
                      >
                        <option value="neutraal">Neutraal</option>
                        <option value="verdacht">Verdacht</option>
                        <option value="vrijgepleit">Vrijgepleit</option>
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Pinned Clues & Custom Traces */}
            <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F151D] space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-2">
                  Vastgepinde aanwijzingen ({note.pinnedClues.length})
                </h3>
                {note.pinnedClues.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    Pin bewijsstukken vanuit het Overzicht om ze hier te verzamelen.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {note.pinnedClues.map((clue) => (
                      <div
                        key={clue}
                        className="flex items-center justify-between gap-2 p-2 rounded bg-slate-50 dark:bg-[#090D12] border border-slate-200 dark:border-slate-800 text-xs"
                      >
                        <span className="truncate">{clue}</span>
                        <button
                          type="button"
                          onClick={() => togglePinnedClue(clue)}
                          className="text-rose-500 hover:underline shrink-0"
                        >
                          Verwijder
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {note.customTraces.length > 0 && (
                <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-2">
                    Opgeslagen eigen sporen ({note.customTraces.length})
                  </h3>
                  <div className="space-y-2">
                    {note.customTraces.map((tr) => (
                      <div
                        key={tr.id}
                        className="flex items-center justify-between gap-2 p-2 rounded bg-slate-50 dark:bg-[#090D12] border border-slate-200 dark:border-slate-800"
                      >
                        <button
                          type="button"
                          onClick={() => openStampInComparator(tr.id)}
                          className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline truncate"
                        >
                          {tr.label}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateNote({
                              ...note,
                              customTraces: note.customTraces.filter(
                                (c) => c.id !== tr.id
                              ),
                            })
                          }
                          aria-label="Verwijder opgeslagen spoor"
                          className="text-rose-500 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
