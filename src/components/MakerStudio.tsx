import React, { useMemo, useState } from 'react';
import {
  Eraser,
  Eye,
  EyeOff,
  FileText,
  Fingerprint,
  FlipHorizontal2,
  Package,
  Pencil,
  Plus,
  Printer,
  RotateCcw,
  Save,
  Sparkles,
  Stamp,
  Trash2,
  Upload,
  UserPlus,
} from 'lucide-react';
import {
  FP_COLS,
  FP_ROWS,
  type CaseFile,
  type EvidenceCategory,
  type EvidenceItem,
  type EvidenceStamp,
  type FingerprintPattern,
  type Person,
  type PersonStatus,
} from '../types.ts';
import {
  cloneMatrix,
  createEmptyMatrix,
  createSmudgedTrace,
  generateFingerprintPreset,
} from '../utils/fingerprint.ts';
import { FingerprintGrid } from './FingerprintGrid.tsx';
import { PersonAvatar } from './PersonAvatar.tsx';
import { TownMapView } from './TownMapView.tsx';

export type MakerTab =
  | 'dossier'
  | 'kaart'
  | 'personen'
  | 'vingerafdrukken'
  | 'bewijsstukken';

interface MakerStudioProps {
  activeTab: MakerTab;
  onChangeTab: (tab: MakerTab) => void;
  cases: CaseFile[];
  activeCase: CaseFile;
  onSelectCase: (caseId: string) => void;
  onUpdateDraft: (next: CaseFile) => void;
  onSaveCase: () => Promise<void>;
  onCreateCase: () => Promise<void>;
  onDeleteCase: (caseId: string) => Promise<void>;
  onOpenPrintDossier: () => void;
  isDirty: boolean;
  isSaving: boolean;
  saveMessage: string | null;
}

const PRESET_PORTRAITS = [
  {
    label: 'Portret 1 (Havenmeester)',
    url: '/src/assets/images/suspect_hendrik_vos_1795419420108.jpg',
  },
  {
    label: 'Portret 2 (Apotheker)',
    url: '/src/assets/images/suspect_claire_vermeer_1795419419847.jpg',
  },
  {
    label: 'Portret 3 (Klokkenmaker)',
    url: '/src/assets/images/suspect_bram_koster_1795419420117.jpg',
  },
  {
    label: 'Portret 4 (Journaliste)',
    url: '/src/assets/images/suspect_lotje_bakker_1795419420110.jpg',
  },
];

export const MakerStudio: React.FC<MakerStudioProps> = ({
  activeTab,
  onChangeTab,
  cases,
  activeCase,
  onSelectCase,
  onUpdateDraft,
  onSaveCase,
  onCreateCase,
  onDeleteCase,
  onOpenPrintDossier,
  isDirty,
  isSaving,
  saveMessage,
}) => {
  const [selectedPersonId, setSelectedPersonId] = useState<string>(
    activeCase.persons[0]?.id ?? ''
  );
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string>(
    activeCase.evidence[0]?.id ?? ''
  );
  const [selectedStampId, setSelectedStampId] = useState<string>(
    activeCase.evidence[0]?.stamps[0]?.id ?? ''
  );
  const [brushMode, setBrushMode] = useState<'ridge' | 'faint' | 'erase'>('ridge');
  const [fpSeed, setFpSeed] = useState(15);
  const [confirmDeleteCase, setConfirmDeleteCase] = useState(false);

  // Stamp creator controls
  const [stampSourcePersonId, setStampSourcePersonId] = useState<string>(
    activeCase.persons[0]?.id ?? ''
  );
  const [stampSmudge, setStampSmudge] = useState(25);
  const [stampCrop, setStampCrop] = useState<'full' | 'left' | 'right' | 'top' | 'bottom'>(
    'full'
  );

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

  const selectedStamp = useMemo(
    () =>
      selectedEvidence?.stamps.find((s) => s.id === selectedStampId) ??
      selectedEvidence?.stamps[0] ??
      null,
    [selectedEvidence, selectedStampId]
  );

  const updatePerson = (personId: string, patch: Partial<Person>) => {
    onUpdateDraft({
      ...activeCase,
      persons: activeCase.persons.map((p) =>
        p.id === personId ? { ...p, ...patch } : p
      ),
    });
  };

  const addPerson = () => {
    const idx = activeCase.persons.length + 1;
    const newPerson: Person = {
      id: `per-${Date.now().toString(36)}`,
      code: `PRS-${String(idx).padStart(2, '0')}`,
      name: `Nieuw Persoon ${idx}`,
      alias: '',
      age: 35,
      occupation: 'Inwoner',
      address: activeCase.locations[0]?.address ?? 'Dorpsstraat 1',
      locationId: activeCase.locations[0]?.id ?? '',
      portraitUrl: PRESET_PORTRAITS[(idx - 1) % PRESET_PORTRAITS.length].url,
      status: 'burger',
      alibi: '',
      publicBio: '',
      policeNotes: '',
      fingerprintCode: `FP-NEW-${String(idx).padStart(2, '0')}`,
      fingerprintPattern: 'Lus',
      fingerprint: generateFingerprintPreset('Lus', idx * 9),
      isCulprit: false,
      creatorSecretNote: '',
    };
    onUpdateDraft({
      ...activeCase,
      persons: [...activeCase.persons, newPerson],
    });
    setSelectedPersonId(newPerson.id);
  };

  const deletePerson = (personId: string) => {
    const remaining = activeCase.persons.filter((p) => p.id !== personId);
    onUpdateDraft({
      ...activeCase,
      persons: remaining,
    });
    setSelectedPersonId(remaining[0]?.id ?? '');
  };

  const updateEvidence = (evidenceId: string, patch: Partial<EvidenceItem>) => {
    onUpdateDraft({
      ...activeCase,
      evidence: activeCase.evidence.map((ev) =>
        ev.id === evidenceId ? { ...ev, ...patch } : ev
      ),
    });
  };

  const addEvidence = () => {
    const idx = activeCase.evidence.length + 1;
    const newEv: EvidenceItem = {
      id: `ev-${Date.now().toString(36)}`,
      code: `BW-${String(idx).padStart(2, '0')}`,
      title: `Nieuw Bewijsstuk ${idx}`,
      category: 'voorwerp',
      locationId: activeCase.locations[0]?.id ?? '',
      foundAtLabel: activeCase.locations[0]?.name ?? 'Plaats delict',
      description: 'Omschrijving van het aangetroffen bewijsmateriaal.',
      forensicReport: 'Forensisch labonderzoek gestart.',
      imageUrl: '',
      visibleToPlayers: true,
      stamps: [],
    };
    onUpdateDraft({
      ...activeCase,
      evidence: [...activeCase.evidence, newEv],
    });
    setSelectedEvidenceId(newEv.id);
    setSelectedStampId('');
  };

  const deleteEvidence = (evidenceId: string) => {
    const remaining = activeCase.evidence.filter((e) => e.id !== evidenceId);
    onUpdateDraft({
      ...activeCase,
      evidence: remaining,
    });
    setSelectedEvidenceId(remaining[0]?.id ?? '');
  };

  const addStampToEvidence = () => {
    if (!selectedEvidence) return;
    const sourcePerson =
      activeCase.persons.find((p) => p.id === stampSourcePersonId) ??
      activeCase.persons[0];
    const baseMatrix = sourcePerson
      ? createSmudgedTrace(
          sourcePerson.fingerprint,
          stampSmudge,
          stampCrop,
          selectedEvidence.stamps.length * 13 + 7
        )
      : createEmptyMatrix();

    const stampIdx = selectedEvidence.stamps.length + 1;
    const letter = String.fromCharCode(64 + stampIdx);
    const newStamp: EvidenceStamp = {
      id: `stamp-${Date.now().toString(36)}`,
      label: `Spoor ${selectedEvidence.code}${letter}`,
      personId: sourcePerson?.id ?? '',
      x: 35 + ((stampIdx * 13) % 35),
      y: 35 + ((stampIdx * 11) % 35),
      rotation: -12 + ((stampIdx * 9) % 24),
      smudgeLevel: stampSmudge,
      matrix: baseMatrix,
    };

    updateEvidence(selectedEvidence.id, {
      stamps: [...selectedEvidence.stamps, newStamp],
    });
    setSelectedStampId(newStamp.id);
  };

  const updateStamp = (stampId: string, patch: Partial<EvidenceStamp>) => {
    if (!selectedEvidence) return;
    updateEvidence(selectedEvidence.id, {
      stamps: selectedEvidence.stamps.map((s) =>
        s.id === stampId ? { ...s, ...patch } : s
      ),
    });
  };

  const deleteStamp = (stampId: string) => {
    if (!selectedEvidence) return;
    const remaining = selectedEvidence.stamps.filter((s) => s.id !== stampId);
    updateEvidence(selectedEvidence.id, { stamps: remaining });
    setSelectedStampId(remaining[0]?.id ?? '');
  };

  const handleImageUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    onDataUrl: (url: string) => void
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onDataUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const mirrorFingerprint = (matrix: number[]): number[] => {
    const out = createEmptyMatrix();
    for (let y = 0; y < FP_ROWS; y++) {
      for (let x = 0; x < FP_COLS; x++) {
        out[y * FP_COLS + (FP_COLS - 1 - x)] = matrix[y * FP_COLS + x] ?? 0;
      }
    }
    return out;
  };

  return (
    <div className="space-y-6">
      {/* Studio Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F151D]">
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="maker-case-select" className="sr-only">
            Kies actief dossier
          </label>
          <select
            id="maker-case-select"
            value={activeCase.id}
            onChange={(e) => onSelectCase(e.target.value)}
            className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090D12] text-slate-900 dark:text-white"
          >
            {cases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} — {c.title} ({c.status === 'published' ? 'Gepubliceerd' : 'Concept'})
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={onCreateCase}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nieuw dossier</span>
          </button>

          <span className="text-xs text-slate-500 dark:text-slate-400">
            {activeCase.locations.length} locaties · {activeCase.persons.length} personen ·{' '}
            {activeCase.evidence.length} bewijsstukken
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {saveMessage && (
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
              {saveMessage}
            </span>
          )}
          {isDirty && !saveMessage && (
            <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
              Niet-opgeslagen wijzigingen
            </span>
          )}

          <button
            type="button"
            onClick={onOpenPrintDossier}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Papieren Dossier</span>
          </button>

          <button
            type="button"
            onClick={onSaveCase}
            disabled={isSaving}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white transition-colors whitespace-nowrap shrink-0"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSaving ? 'Opslaan...' : 'Dossier opslaan'}</span>
          </button>
        </div>
      </div>

      {/* TAB 1: DOSSIER SETTINGS */}
      {activeTab === 'dossier' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F151D] space-y-5">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  01. Dossierconfiguratie &amp; Briefing
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Beheer het hoofdverhaal en de publicatiestatus voor spelers.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  onUpdateDraft({
                    ...activeCase,
                    status: activeCase.status === 'published' ? 'draft' : 'published',
                  })
                }
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                  activeCase.status === 'published'
                    ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
                    : 'bg-amber-500/10 border-amber-500/40 text-amber-700 dark:text-amber-300'
                }`}
              >
                {activeCase.status === 'published' ? (
                  <>
                    <Eye className="w-3.5 h-3.5" />
                    <span>Gepubliceerd voor spelers</span>
                  </>
                ) : (
                  <>
                    <EyeOff className="w-3.5 h-3.5" />
                    <span>Concept (verborgen)</span>
                  </>
                )}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Dossiercode
                </label>
                <input
                  type="text"
                  value={activeCase.code}
                  onChange={(e) => onUpdateDraft({ ...activeCase, code: e.target.value })}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090D12]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Speler toegangscode
                </label>
                <input
                  type="text"
                  value={activeCase.joinCode ?? activeCase.code}
                  onChange={(e) =>
                    onUpdateDraft({
                      ...activeCase,
                      joinCode: e.target.value.toUpperCase(),
                    })
                  }
                  placeholder="bijv. ZAAK-047"
                  className="w-full px-3 py-2 text-sm font-mono uppercase rounded-lg border border-emerald-500/40 dark:border-emerald-500/40 bg-slate-50 dark:bg-[#090D12]"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Titel van het mysterie
                </label>
                <input
                  type="text"
                  value={activeCase.title}
                  onChange={(e) => onUpdateDraft({ ...activeCase, title: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090D12]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Naam van dorp / stad
                </label>
                <input
                  type="text"
                  value={activeCase.townName}
                  onChange={(e) =>
                    onUpdateDraft({ ...activeCase, townName: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090D12]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Ondertitel
                </label>
                <input
                  type="text"
                  value={activeCase.subtitle}
                  onChange={(e) =>
                    onUpdateDraft({ ...activeCase, subtitle: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090D12]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Politiebriefing &amp; Verhaal
              </label>
              <textarea
                rows={5}
                value={activeCase.briefing}
                onChange={(e) =>
                  onUpdateDraft({ ...activeCase, briefing: e.target.value })
                }
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090D12] leading-relaxed"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Instructie voor op het uitgeprinte papieren dossier
              </label>
              <textarea
                rows={3}
                value={activeCase.printedDossierGuide}
                onChange={(e) =>
                  onUpdateDraft({
                    ...activeCase,
                    printedDossierGuide: e.target.value,
                  })
                }
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090D12]"
              />
            </div>
          </div>

          <aside className="lg:col-span-4 space-y-6">
            <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F151D] space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Snelle Bouwstappen
              </h3>
              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={() => onChangeTab('kaart')}
                  className="w-full text-left p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-emerald-500/60 bg-slate-50 dark:bg-[#090D12] transition-colors"
                >
                  <div className="text-xs font-semibold text-slate-900 dark:text-white">
                    1. Dorpskaart inrichten
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Teken wegen, water en gebouwen op het raster.
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => onChangeTab('personen')}
                  className="w-full text-left p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-emerald-500/60 bg-slate-50 dark:bg-[#090D12] transition-colors"
                >
                  <div className="text-xs font-semibold text-slate-900 dark:text-white">
                    2. Personen toevoegen
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Voeg verdachten, adressen en alibi&apos;s toe.
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => onChangeTab('vingerafdrukken')}
                  className="w-full text-left p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-emerald-500/60 bg-slate-50 dark:bg-[#090D12] transition-colors"
                >
                  <div className="text-xs font-semibold text-slate-900 dark:text-white">
                    3. Pixel-vingerafdrukken tekenen
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Ontwerp unieke vingerafdrukken op het pixelscherm.
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => onChangeTab('bewijsstukken')}
                  className="w-full text-left p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-emerald-500/60 bg-slate-50 dark:bg-[#090D12] transition-colors"
                >
                  <div className="text-xs font-semibold text-slate-900 dark:text-white">
                    4. Bewijsstukken &amp; Sporen zetten
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Zet vingerafdrukken op bewijsmateriaal voor het spel.
                  </div>
                </button>
              </div>
            </div>

            {cases.length > 1 && (
              <div className="p-5 rounded-xl border border-rose-500/30 bg-white dark:bg-[#0F151D] space-y-3">
                <h3 className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                  Dossier verwijderen
                </h3>
                {!confirmDeleteCase ? (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteCase(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-rose-500/40 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Dit dossier verwijderen</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        setConfirmDeleteCase(false);
                        await onDeleteCase(activeCase.id);
                      }}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-600 text-white"
                    >
                      Bevestig verwijderen
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteCase(false)}
                      className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700"
                    >
                      Annuleren
                    </button>
                  </div>
                )}
              </div>
            )}
          </aside>
        </div>
      )}

      {/* TAB 2: KAARTBOUWER */}
      {activeTab === 'kaart' && (
        <TownMapView
          caseFile={activeCase}
          editable
          onUpdateCase={onUpdateDraft}
        />
      )}

      {/* TAB 3: PERSONEN */}
      {activeTab === 'personen' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-4 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F151D] space-y-3">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Personen ({activeCase.persons.length})
              </h2>
              <button
                type="button"
                onClick={addPerson}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Toevoegen</span>
              </button>
            </div>

            {activeCase.persons.length === 0 ? (
              <p className="text-xs text-slate-500 py-8 text-center">
                Nog geen personen aangemaakt.
              </p>
            ) : (
              <div className="space-y-2">
                {activeCase.persons.map((person) => (
                  <button
                    key={person.id}
                    type="button"
                    onClick={() => setSelectedPersonId(person.id)}
                    className={`w-full flex items-center gap-3 p-2.5 rounded-lg border text-left transition-colors ${
                      selectedPerson?.id === person.id
                        ? 'border-emerald-500 bg-emerald-500/10'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090D12] hover:border-slate-400'
                    }`}
                  >
                    <PersonAvatar src={person.portraitUrl} name={person.name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                        {person.name}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {person.code} · {person.occupation} · {person.status}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="lg:col-span-8 p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F151D]">
            {!selectedPerson ? (
              <div className="py-16 text-center text-sm text-slate-500">
                Selecteer een persoon of voeg er een toe om te bewerken.
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-4">
                    <PersonAvatar
                      src={selectedPerson.portraitUrl}
                      name={selectedPerson.name}
                      size="lg"
                    />
                    <div>
                      <div className="font-mono text-xs text-emerald-600 dark:text-emerald-400">
                        {selectedPerson.code} · {selectedPerson.fingerprintCode}
                      </div>
                      <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                        {selectedPerson.name}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {selectedPerson.occupation} · {selectedPerson.address}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onChangeTab('vingerafdrukken')}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <Fingerprint className="w-4 h-4 text-emerald-500" />
                      <span>Vingerafdruk tekenen</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => deletePerson(selectedPerson.id)}
                      aria-label="Verwijder persoon"
                      className="p-2 rounded-lg border border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Volledige naam
                    </label>
                    <input
                      type="text"
                      value={selectedPerson.name}
                      onChange={(e) =>
                        updatePerson(selectedPerson.id, { name: e.target.value })
                      }
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090D12]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Alias / Bijnaam
                    </label>
                    <input
                      type="text"
                      value={selectedPerson.alias}
                      onChange={(e) =>
                        updatePerson(selectedPerson.id, { alias: e.target.value })
                      }
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090D12]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Leeftijd
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={120}
                      value={selectedPerson.age}
                      onChange={(e) =>
                        updatePerson(selectedPerson.id, {
                          age: Number(e.target.value) || 0,
                        })
                      }
                      className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090D12]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Beroep / Rol
                    </label>
                    <input
                      type="text"
                      value={selectedPerson.occupation}
                      onChange={(e) =>
                        updatePerson(selectedPerson.id, { occupation: e.target.value })
                      }
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090D12]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Status in dossier
                    </label>
                    <select
                      value={selectedPerson.status}
                      onChange={(e) =>
                        updatePerson(selectedPerson.id, {
                          status: e.target.value as PersonStatus,
                        })
                      }
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090D12]"
                    >
                      <option value="verdachte">Verdachte</option>
                      <option value="getuige">Getuige</option>
                      <option value="slachtoffer">Slachtoffer</option>
                      <option value="burger">Burger / Inwoner</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Gekoppelde kaartlocatie
                    </label>
                    <select
                      value={selectedPerson.locationId}
                      onChange={(e) => {
                        const loc = activeCase.locations.find(
                          (l) => l.id === e.target.value
                        );
                        updatePerson(selectedPerson.id, {
                          locationId: e.target.value,
                          address: loc ? loc.address : selectedPerson.address,
                        });
                      }}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090D12]"
                    >
                      <option value="">Geen gekoppelde locatie</option>
                      {activeCase.locations.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.code} — {loc.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Adresregel
                    </label>
                    <input
                      type="text"
                      value={selectedPerson.address}
                      onChange={(e) =>
                        updatePerson(selectedPerson.id, { address: e.target.value })
                      }
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090D12]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Portret kiezen of uploaden
                    </label>
                    <div className="flex items-center gap-2">
                      <select
                        value={
                          PRESET_PORTRAITS.some(
                            (p) => p.url === selectedPerson.portraitUrl
                          )
                            ? selectedPerson.portraitUrl
                            : ''
                        }
                        onChange={(e) =>
                          updatePerson(selectedPerson.id, {
                            portraitUrl: e.target.value,
                          })
                        }
                        className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090D12]"
                      >
                        <option value="">Initialen / Eigen foto</option>
                        {PRESET_PORTRAITS.map((p) => (
                          <option key={p.url} value={p.url}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                      <label className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0">
                        <Upload className="w-3.5 h-3.5" />
                        <span>Upload</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) =>
                            handleImageUpload(e, (url) =>
                              updatePerson(selectedPerson.id, { portraitUrl: url })
                            )
                          }
                        />
                      </label>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Alibi / Verklaring
                  </label>
                  <textarea
                    rows={2}
                    value={selectedPerson.alibi}
                    onChange={(e) =>
                      updatePerson(selectedPerson.id, { alibi: e.target.value })
                    }
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090D12]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Openbare achtergrond (voor spelers)
                    </label>
                    <textarea
                      rows={3}
                      value={selectedPerson.publicBio}
                      onChange={(e) =>
                        updatePerson(selectedPerson.id, { publicBio: e.target.value })
                      }
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090D12]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Politie-aantekeningen (voor spelers)
                    </label>
                    <textarea
                      rows={3}
                      value={selectedPerson.policeNotes}
                      onChange={(e) =>
                        updatePerson(selectedPerson.id, { policeNotes: e.target.value })
                      }
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090D12]"
                    />
                  </div>
                </div>

                {/* Creator-only secret block */}
                <div className="p-4 rounded-lg border border-amber-500/30 bg-amber-500/5 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                      Alleen voor de Maker (niet zichtbaar voor spelers)
                    </span>
                    <label className="inline-flex items-center gap-2 text-xs font-medium cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(selectedPerson.isCulprit)}
                        onChange={(e) =>
                          updatePerson(selectedPerson.id, {
                            isCulprit: e.target.checked,
                          })
                        }
                        className="rounded border-slate-400 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>Is de dader</span>
                    </label>
                  </div>
                  <input
                    type="text"
                    value={selectedPerson.creatorSecretNote ?? ''}
                    onChange={(e) =>
                      updatePerson(selectedPerson.id, {
                        creatorSecretNote: e.target.value,
                      })
                    }
                    placeholder="Geheime spelleider-notitie over dit personage..."
                    className="w-full px-3 py-2 text-xs rounded-lg border border-amber-500/30 bg-white dark:bg-[#090D12]"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: PIXELSCHERM VINGERAFDRUK STUDIO */}
      {activeTab === 'vingerafdrukken' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-4 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F151D] space-y-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                03. Vingerafdrukstudio (Pixelscherm)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Kies een persoon en teken of genereer de 16×20 pixel-vingerafdruk.
              </p>
            </div>

            <div className="space-y-2">
              {activeCase.persons.map((person) => (
                <button
                  key={person.id}
                  type="button"
                  onClick={() => setSelectedPersonId(person.id)}
                  className={`w-full flex items-center justify-between gap-3 p-2.5 rounded-lg border text-left transition-colors ${
                    selectedPerson?.id === person.id
                      ? 'border-emerald-500 bg-emerald-500/10'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090D12]'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                      {person.name}
                    </div>
                    <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                      {person.fingerprintCode} · {person.fingerprintPattern}
                    </div>
                  </div>
                  <FingerprintGrid matrix={person.fingerprint} cellSize={3} />
                </button>
              ))}
            </div>
          </div>

          <div className="lg:col-span-8 p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F151D]">
            {!selectedPerson ? (
              <div className="py-12 text-center text-sm text-slate-500">
                Voeg eerst een persoon toe bij het tabblad Personen.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
                <div className="md:col-span-7 flex flex-col items-center p-4 rounded-xl bg-slate-50 dark:bg-[#090D12] border border-slate-200 dark:border-slate-800">
                  <div className="w-full flex items-center justify-between mb-3">
                    <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400">
                      {selectedPerson.name} · {selectedPerson.fingerprintCode}
                    </span>
                    <span className="text-xs font-mono text-slate-500">
                      {FP_COLS}×{FP_ROWS} px
                    </span>
                  </div>

                  <FingerprintGrid
                    matrix={selectedPerson.fingerprint}
                    editable
                    brushMode={brushMode}
                    showCoordinates
                    cellSize={20}
                    onChange={(next) =>
                      updatePerson(selectedPerson.id, { fingerprint: next })
                    }
                  />
                </div>

                <div className="md:col-span-5 space-y-5">
                  <div>
                    <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                      Tekengereedschap
                    </h3>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setBrushMode('ridge')}
                        className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                          brushMode === 'ridge'
                            ? 'bg-emerald-600 text-white border-emerald-500'
                            : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>Lijn</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setBrushMode('faint')}
                        className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                          brushMode === 'faint'
                            ? 'bg-emerald-600 text-white border-emerald-500'
                            : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Vaag</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setBrushMode('erase')}
                        className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                          brushMode === 'erase'
                            ? 'bg-rose-600 text-white border-rose-500'
                            : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <Eraser className="w-3.5 h-3.5" />
                        <span>Gum</span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Vingerafdrukcode
                      </label>
                      <input
                        type="text"
                        value={selectedPerson.fingerprintCode}
                        onChange={(e) =>
                          updatePerson(selectedPerson.id, {
                            fingerprintCode: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090D12]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Patroonclassificatie
                      </label>
                      <select
                        value={selectedPerson.fingerprintPattern}
                        onChange={(e) =>
                          updatePerson(selectedPerson.id, {
                            fingerprintPattern: e.target.value as FingerprintPattern,
                          })
                        }
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090D12]"
                      >
                        <option value="Kring">Kring (Whorl)</option>
                        <option value="Lus">Lus (Loop)</option>
                        <option value="Boog">Boog (Arch)</option>
                        <option value="Samengesteld">Samengesteld</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                      Patroon genereren of aanpassen
                    </h3>
                    <div className="grid grid-cols-2 gap-2">
                      {(['Kring', 'Lus', 'Boog', 'Samengesteld'] as FingerprintPattern[]).map(
                        (pat) => (
                          <button
                            key={pat}
                            type="button"
                            onClick={() => {
                              const nextSeed = fpSeed + 5;
                              setFpSeed(nextSeed);
                              updatePerson(selectedPerson.id, {
                                fingerprintPattern: pat,
                                fingerprint: generateFingerprintPreset(pat, nextSeed),
                              });
                            }}
                            className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:border-emerald-500 bg-slate-50 dark:bg-[#090D12] transition-colors"
                          >
                            Genereer {pat}
                          </button>
                        )
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <button
                        type="button"
                        onClick={() =>
                          updatePerson(selectedPerson.id, {
                            fingerprint: mirrorFingerprint(selectedPerson.fingerprint),
                          })
                        }
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <FlipHorizontal2 className="w-3.5 h-3.5" />
                        <span>Spiegelen</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updatePerson(selectedPerson.id, {
                            fingerprint: createEmptyMatrix(),
                          })
                        }
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Leegmaken</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: BEWIJSSTUKKEN & VINGERAFDRUKKEN PLAATSEN */}
      {activeTab === 'bewijsstukken' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Evidence List */}
          <div className="lg:col-span-4 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F151D] space-y-3">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Bewijsstukken ({activeCase.evidence.length})
              </h2>
              <button
                type="button"
                onClick={addEvidence}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Toevoegen</span>
              </button>
            </div>

            {activeCase.evidence.length === 0 ? (
              <p className="text-xs text-slate-500 py-8 text-center">
                Nog geen bewijsstukken toegevoegd.
              </p>
            ) : (
              <div className="space-y-2">
                {activeCase.evidence.map((ev) => (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => {
                      setSelectedEvidenceId(ev.id);
                      setSelectedStampId(ev.stamps[0]?.id ?? '');
                    }}
                    className={`w-full p-3 rounded-lg border text-left transition-colors ${
                      selectedEvidence?.id === ev.id
                        ? 'border-emerald-500 bg-emerald-500/10'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090D12] hover:border-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-emerald-600 dark:text-emerald-400">
                        {ev.code}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        {ev.stamps.length} afdruk(ken)
                      </span>
                    </div>
                    <div className="text-xs font-semibold text-slate-900 dark:text-white mt-0.5 truncate">
                      {ev.title}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Evidence + Stamp Studio */}
          <div className="lg:col-span-8 space-y-6">
            {!selectedEvidence ? (
              <div className="p-12 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F151D] text-center text-sm text-slate-500">
                Selecteer een bewijsstuk of maak een nieuw bewijsstuk aan.
              </div>
            ) : (
              <>
                <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F151D] space-y-4">
                  <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
                    <div>
                      <span className="font-mono text-xs text-emerald-600 dark:text-emerald-400">
                        {selectedEvidence.code}
                      </span>
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                        {selectedEvidence.title}
                      </h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          updateEvidence(selectedEvidence.id, {
                            visibleToPlayers: !selectedEvidence.visibleToPlayers,
                          })
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700"
                      >
                        {selectedEvidence.visibleToPlayers ? (
                          <>
                            <Eye className="w-3.5 h-3.5 text-emerald-500" />
                            <span>Zichtbaar</span>
                          </>
                        ) : (
                          <>
                            <EyeOff className="w-3.5 h-3.5 text-amber-500" />
                            <span>Verborgen</span>
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteEvidence(selectedEvidence.id)}
                        aria-label="Verwijder bewijsstuk"
                        className="p-2 rounded-lg border border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Bewijscode
                      </label>
                      <input
                        type="text"
                        value={selectedEvidence.code}
                        onChange={(e) =>
                          updateEvidence(selectedEvidence.id, { code: e.target.value })
                        }
                        className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090D12]"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Titel bewijsstuk
                      </label>
                      <input
                        type="text"
                        value={selectedEvidence.title}
                        onChange={(e) =>
                          updateEvidence(selectedEvidence.id, { title: e.target.value })
                        }
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090D12]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Categorie
                      </label>
                      <select
                        value={selectedEvidence.category}
                        onChange={(e) =>
                          updateEvidence(selectedEvidence.id, {
                            category: e.target.value as EvidenceCategory,
                          })
                        }
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090D12]"
                      >
                        <option value="voorwerp">Voorwerp</option>
                        <option value="document">Document / Brief</option>
                        <option value="digitaal">Digitaal Spoor</option>
                        <option value="biologisch">Biologisch / Chemisch</option>
                        <option value="spoor">Dactyloscopisch Spoor</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Locatie op kaart
                      </label>
                      <select
                        value={selectedEvidence.locationId}
                        onChange={(e) =>
                          updateEvidence(selectedEvidence.id, {
                            locationId: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090D12]"
                      >
                        <option value="">Geen kaartkoppeling</option>
                        {activeCase.locations.map((loc) => (
                          <option key={loc.id} value={loc.id}>
                            {loc.code} — {loc.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Vindplaats omschrijving
                      </label>
                      <input
                        type="text"
                        value={selectedEvidence.foundAtLabel}
                        onChange={(e) =>
                          updateEvidence(selectedEvidence.id, {
                            foundAtLabel: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090D12]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Omschrijving
                      </label>
                      <textarea
                        rows={3}
                        value={selectedEvidence.description}
                        onChange={(e) =>
                          updateEvidence(selectedEvidence.id, {
                            description: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090D12]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Forensisch rapport
                      </label>
                      <textarea
                        rows={3}
                        value={selectedEvidence.forensicReport}
                        onChange={(e) =>
                          updateEvidence(selectedEvidence.id, {
                            forensicReport: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090D12]"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <label className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
                      <Upload className="w-3.5 h-3.5" />
                      <span>Afbeelding bij bewijsstuk uploaden</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) =>
                          handleImageUpload(e, (url) =>
                            updateEvidence(selectedEvidence.id, { imageUrl: url })
                          )
                        }
                      />
                    </label>
                    {selectedEvidence.imageUrl && (
                      <button
                        type="button"
                        onClick={() =>
                          updateEvidence(selectedEvidence.id, { imageUrl: '' })
                        }
                        className="text-xs text-rose-600 dark:text-rose-400 hover:underline"
                      >
                        Afbeelding verwijderen
                      </button>
                    )}
                  </div>
                </div>

                {/* Fingerprint Stamping on Evidence Surface */}
                <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F151D] space-y-5">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                      Vingerafdrukken op dit bewijsstuk plaatsen
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Stempel de vingerafdruk van een persoon (of een vervaagd gedeeltelijk spoor)
                      direct op het bewijsmateriaal.
                    </p>
                  </div>

                  {/* Add Stamp Bar */}
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 p-4 rounded-lg bg-slate-50 dark:bg-[#090D12] border border-slate-200 dark:border-slate-800 items-end">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-500 mb-1">
                        Bronpersoon
                      </label>
                      <select
                        value={stampSourcePersonId}
                        onChange={(e) => setStampSourcePersonId(e.target.value)}
                        className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F151D]"
                      >
                        {activeCase.persons.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.fingerprintCode})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-500 mb-1">
                        Uitsnede
                      </label>
                      <select
                        value={stampCrop}
                        onChange={(e) =>
                          setStampCrop(
                            e.target.value as 'full' | 'left' | 'right' | 'top' | 'bottom'
                          )
                        }
                        className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F151D]"
                      >
                        <option value="full">Volledige afdruk</option>
                        <option value="left">Linkerhelft</option>
                        <option value="right">Rechterhelft</option>
                        <option value="top">Bovenkant</option>
                        <option value="bottom">Onderkant</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-500 mb-1">
                        Vervaging ({stampSmudge}%)
                      </label>
                      <input
                        type="range"
                        min={0}
                        max={65}
                        value={stampSmudge}
                        onChange={(e) => setStampSmudge(Number(e.target.value))}
                        className="w-full accent-emerald-600"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={addStampToEvidence}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                    >
                      <Stamp className="w-3.5 h-3.5" />
                      <span>Spoor plaatsen</span>
                    </button>
                  </div>

                  {/* Interactive Visual Evidence Surface + Stamp Editor */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
                    <div className="md:col-span-6 space-y-2">
                      <div className="text-xs font-medium text-slate-600 dark:text-slate-400">
                        Bewijs-oppervlak (klik om actief spoor te verplaatsen)
                      </div>
                      <div
                        onClick={(e) => {
                          if (!selectedStamp) return;
                          const rect = e.currentTarget.getBoundingClientRect();
                          const xPct = Math.round(
                            Math.max(10, Math.min(90, ((e.clientX - rect.left) / rect.width) * 100))
                          );
                          const yPct = Math.round(
                            Math.max(12, Math.min(88, ((e.clientY - rect.top) / rect.height) * 100))
                          );
                          updateStamp(selectedStamp.id, { x: xPct, y: yPct });
                        }}
                        className="relative h-64 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-[#090D12] overflow-hidden cursor-crosshair forensic-grid-bg"
                      >
                        {selectedEvidence.imageUrl ? (
                          <img
                            src={selectedEvidence.imageUrl}
                            alt={selectedEvidence.title}
                            referrerPolicy="no-referrer"
                            className="absolute inset-0 w-full h-full object-cover opacity-55 pointer-events-none"
                          />
                        ) : (
                          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 dark:text-slate-600 pointer-events-none">
                            {selectedEvidence.category === 'document' ? (
                              <FileText className="w-12 h-12 mb-1 opacity-40" />
                            ) : (
                              <Package className="w-12 h-12 mb-1 opacity-40" />
                            )}
                            <span className="font-mono text-xs">{selectedEvidence.code}</span>
                          </div>
                        )}

                        {selectedEvidence.stamps.map((stamp) => {
                          const isCurrent = selectedStamp?.id === stamp.id;
                          return (
                            <button
                              key={stamp.id}
                              type="button"
                              onClick={(ev) => {
                                ev.stopPropagation();
                                setSelectedStampId(stamp.id);
                              }}
                              style={{
                                left: `${stamp.x}%`,
                                top: `${stamp.y}%`,
                                transform: `translate(-50%, -50%) rotate(${stamp.rotation}deg)`,
                              }}
                              className={`absolute p-1 rounded border transition-all ${
                                isCurrent
                                  ? 'border-emerald-400 bg-emerald-500/20 ring-2 ring-emerald-400/50 z-10'
                                  : 'border-slate-400/60 bg-black/25 hover:border-emerald-400'
                              }`}
                            >
                              <FingerprintGrid matrix={stamp.matrix} cellSize={3} />
                              <span className="block text-[9px] font-mono text-white bg-black/70 px-1 rounded mt-0.5 whitespace-nowrap">
                                {stamp.label}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="md:col-span-6 space-y-4">
                      {!selectedStamp ? (
                        <div className="py-12 text-center text-xs text-slate-500 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl">
                          Plaats hierboven een vingerafdrukspoor op dit bewijsstuk.
                        </div>
                      ) : (
                        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090D12] space-y-4">
                          <div className="flex items-center justify-between gap-2">
                            <input
                              type="text"
                              value={selectedStamp.label}
                              onChange={(e) =>
                                updateStamp(selectedStamp.id, { label: e.target.value })
                              }
                              className="px-2.5 py-1 text-xs font-mono font-semibold rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F151D]"
                            />
                            <button
                              type="button"
                              onClick={() => deleteStamp(selectedStamp.id)}
                              className="p-1.5 text-rose-500 hover:bg-rose-500/10 rounded"
                              aria-label="Verwijder spoor"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>

                          <div>
                            <label className="block text-[11px] font-medium text-slate-500 mb-1">
                              Rotatie op bewijsstuk ({selectedStamp.rotation}°)
                            </label>
                            <input
                              type="range"
                              min={-45}
                              max={45}
                              value={selectedStamp.rotation}
                              onChange={(e) =>
                                updateStamp(selectedStamp.id, {
                                  rotation: Number(e.target.value),
                                })
                              }
                              className="w-full accent-emerald-600"
                            />
                          </div>

                          <div className="flex flex-col items-center">
                            <span className="text-[11px] text-slate-500 mb-2">
                              Pixels van dit geplaatste spoor handmatig verfijnen:
                            </span>
                            <FingerprintGrid
                              matrix={cloneMatrix(selectedStamp.matrix)}
                              editable
                              brushMode="ridge"
                              cellSize={11}
                              onChange={(next) =>
                                updateStamp(selectedStamp.id, { matrix: next })
                              }
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
