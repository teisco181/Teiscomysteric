import React, { useMemo, useState } from 'react';
import {
  Anchor,
  Building2,
  Coffee,
  Eye,
  EyeOff,
  FolderOpen,
  Home,
  Landmark,
  Map as MapIcon,
  MapPin,
  Minus,
  Plus,
  Save,
  Search,
  Shield,
  Store,
  Trash2,
} from 'lucide-react';
import {
  MAP_COLS,
  MAP_ROWS,
  type CaseFile,
  type EvidenceItem,
  type LocationCategory,
  type MapLocation,
  type MapTemplate,
  type Person,
  type TerrainType,
} from '../types.ts';

interface TownMapViewProps {
  caseFile: CaseFile;
  editable?: boolean;
  onUpdateCase?: (next: CaseFile) => void;
  onSelectPerson?: (person: Person) => void;
  onSelectEvidence?: (evidence: EvidenceItem) => void;
  mapTemplates?: MapTemplate[];
  onSaveNewMapTemplate?: (name: string) => Promise<void>;
  onUpdateMapTemplate?: (mapId: string) => Promise<void>;
  onApplyMapTemplate?: (template: MapTemplate) => void;
  onDeleteMapTemplate?: (mapId: string) => Promise<void>;
}

const TERRAIN_META: Record<
  TerrainType,
  { label: string; darkBg: string; lightBg: string }
> = {
  grass: {
    label: 'Gras / Groen',
    darkBg: 'bg-[#0C1714] border-[#13251F]',
    lightBg: 'bg-emerald-50 border-emerald-200/70',
  },
  road: {
    label: 'Straat / Weg',
    darkBg: 'bg-[#1D2430] border-[#2A3444]',
    lightBg: 'bg-slate-300 border-slate-400/50',
  },
  water: {
    label: 'Water / Gracht',
    darkBg: 'bg-[#0B2239] border-[#113152]',
    lightBg: 'bg-sky-200 border-sky-300',
  },
  cobble: {
    label: 'Klinkers / Kade',
    darkBg: 'bg-[#262932] border-[#333845]',
    lightBg: 'bg-stone-300 border-stone-400/60',
  },
  forest: {
    label: 'Bosrand',
    darkBg: 'bg-[#0A1F18] border-[#113327]',
    lightBg: 'bg-emerald-200/75 border-emerald-300',
  },
  bridge: {
    label: 'Brug',
    darkBg: 'bg-[#3A2D21] border-[#523F2E]',
    lightBg: 'bg-amber-200 border-amber-300',
  },
  plaza: {
    label: 'Plein',
    darkBg: 'bg-[#1F2937] border-[#334155]',
    lightBg: 'bg-slate-200 border-slate-300',
  },
};

const CATEGORY_META: Record<
  LocationCategory,
  { label: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  police: { label: 'Politie', Icon: Shield },
  house: { label: 'Woning', Icon: Home },
  shop: { label: 'Winkel / Bedrijf', Icon: Store },
  harbor: { label: 'Haven / Water', Icon: Anchor },
  tavern: { label: 'Horeca', Icon: Coffee },
  landmark: { label: 'Monument / Pand', Icon: Landmark },
  alley: { label: 'Steeg / Plek', Icon: MapPin },
};

export const TownMapView: React.FC<TownMapViewProps> = ({
  caseFile,
  editable = false,
  onUpdateCase,
  onSelectPerson,
  onSelectEvidence,
  mapTemplates = [],
  onSaveNewMapTemplate,
  onUpdateMapTemplate,
  onApplyMapTemplate,
  onDeleteMapTemplate,
}) => {
  const [selectedLocId, setSelectedLocId] = useState<string | null>(
    caseFile.locations[0]?.id ?? null
  );
  const [paintTerrain, setPaintTerrain] = useState<TerrainType | null>(null);
  const [placingNew, setPlacingNew] = useState(false);
  const [movingLocId, setMovingLocId] = useState<string | null>(null);
  const [isPainting, setIsPainting] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<LocationCategory | 'all'>('all');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    mapTemplates[0]?.id ?? ''
  );
  const [newTemplateName, setNewTemplateName] = useState('');
  const [mapBusy, setMapBusy] = useState(false);
  const [mapNotice, setMapNotice] = useState<string | null>(null);
  const [confirmDeleteMap, setConfirmDeleteMap] = useState(false);

  const selectedLocation = useMemo(
    () => caseFile.locations.find((l) => l.id === selectedLocId) ?? null,
    [caseFile.locations, selectedLocId]
  );

  const filteredLocations = useMemo(() => {
    const q = search.trim().toLowerCase();
    return caseFile.locations.filter((loc) => {
      if (categoryFilter !== 'all' && loc.category !== categoryFilter) return false;
      if (!q) return true;
      const linkedPersons = caseFile.persons.filter((p) => p.locationId === loc.id);
      const matchesPerson = linkedPersons.some(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.occupation.toLowerCase().includes(q)
      );
      return (
        loc.name.toLowerCase().includes(q) ||
        loc.address.toLowerCase().includes(q) ||
        loc.code.toLowerCase().includes(q) ||
        matchesPerson
      );
    });
  }, [caseFile.locations, caseFile.persons, search, categoryFilter]);

  const matchingIds = useMemo(
    () => new Set(filteredLocations.map((l) => l.id)),
    [filteredLocations]
  );

  const mapCols = Math.max(8, Math.min(48, caseFile.mapCols || MAP_COLS));
  const mapRows = Math.max(6, Math.min(36, caseFile.mapRows || MAP_ROWS));

  const resizeMap = (nextCols: number, nextRows: number) => {
    if (!editable || !onUpdateCase) return;
    const clampedCols = Math.max(8, Math.min(48, nextCols));
    const clampedRows = Math.max(6, Math.min(36, nextRows));
    if (clampedCols === mapCols && clampedRows === mapRows) return;

    const nextTerrain: TerrainType[] = new Array<TerrainType>(
      clampedCols * clampedRows
    ).fill('grass');

    for (let y = 0; y < Math.min(mapRows, clampedRows); y++) {
      for (let x = 0; x < Math.min(mapCols, clampedCols); x++) {
        nextTerrain[y * clampedCols + x] =
          caseFile.terrain[y * mapCols + x] ?? 'grass';
      }
    }

    const nextLocations = caseFile.locations.map((loc) => {
      const w = Math.min(loc.width, clampedCols);
      const h = Math.min(loc.height, clampedRows);
      return {
        ...loc,
        width: w,
        height: h,
        x: Math.max(0, Math.min(loc.x, clampedCols - w)),
        y: Math.max(0, Math.min(loc.y, clampedRows - h)),
      };
    });

    onUpdateCase({
      ...caseFile,
      mapCols: clampedCols,
      mapRows: clampedRows,
      terrain: nextTerrain,
      locations: nextLocations,
    });
  };

  const handleTileAction = (x: number, y: number) => {
    if (!editable || !onUpdateCase) return;

    if (placingNew) {
      const nextCode = `LOC-${String(caseFile.locations.length + 1).padStart(2, '0')}`;
      const created: MapLocation = {
        id: `loc-${Date.now().toString(36)}`,
        code: nextCode,
        name: `Nieuwe Locatie ${caseFile.locations.length + 1}`,
        category: 'house',
        x: Math.min(x, Math.max(0, mapCols - 2)),
        y: Math.min(y, Math.max(0, mapRows - 2)),
        width: 2,
        height: 2,
        address: `Dorpsstraat ${caseFile.locations.length + 1}`,
        description: 'Nieuwe locatie in het dorp.',
        publicNote: '',
        visibleToPlayers: true,
      };
      onUpdateCase({
        ...caseFile,
        locations: [...caseFile.locations, created],
      });
      setSelectedLocId(created.id);
      setPlacingNew(false);
      return;
    }

    if (movingLocId) {
      const nextLocs = caseFile.locations.map((loc) => {
        if (loc.id !== movingLocId) return loc;
        return {
          ...loc,
          x: Math.min(x, Math.max(0, mapCols - loc.width)),
          y: Math.min(y, Math.max(0, mapRows - loc.height)),
        };
      });
      onUpdateCase({ ...caseFile, locations: nextLocs });
      setMovingLocId(null);
      return;
    }

    if (paintTerrain) {
      const idx = y * mapCols + x;
      if (caseFile.terrain[idx] === paintTerrain) return;
      const nextTerrain = [...caseFile.terrain];
      while (nextTerrain.length < mapCols * mapRows) nextTerrain.push('grass');
      nextTerrain[idx] = paintTerrain;
      onUpdateCase({ ...caseFile, terrain: nextTerrain });
    }
  };

  const updateSelectedLocation = (patch: Partial<MapLocation>) => {
    if (!editable || !onUpdateCase || !selectedLocation) return;
    const nextLocs = caseFile.locations.map((loc) =>
      loc.id === selectedLocation.id ? { ...loc, ...patch } : loc
    );
    onUpdateCase({ ...caseFile, locations: nextLocs });
  };

  const deleteSelectedLocation = () => {
    if (!editable || !onUpdateCase || !selectedLocation) return;
    const remaining = caseFile.locations.filter((l) => l.id !== selectedLocation.id);
    onUpdateCase({
      ...caseFile,
      locations: remaining,
      persons: caseFile.persons.map((p) =>
        p.locationId === selectedLocation.id ? { ...p, locationId: '' } : p
      ),
      evidence: caseFile.evidence.map((ev) =>
        ev.locationId === selectedLocation.id ? { ...ev, locationId: '' } : ev
      ),
    });
    setSelectedLocId(remaining[0]?.id ?? null);
  };

  const linkedPersons = useMemo(() => {
    if (!selectedLocation) return [];
    return caseFile.persons.filter((p) => p.locationId === selectedLocation.id);
  }, [caseFile.persons, selectedLocation]);

  const linkedEvidence = useMemo(() => {
    if (!selectedLocation) return [];
    return caseFile.evidence.filter((e) => e.locationId === selectedLocation.id);
  }, [caseFile.evidence, selectedLocation]);

  const activeTemplate = useMemo(
    () =>
      mapTemplates.find((m) => m.id === selectedTemplateId) ??
      mapTemplates[0] ??
      null,
    [mapTemplates, selectedTemplateId]
  );

  const showNotice = (msg: string) => {
    setMapNotice(msg);
    setTimeout(() => setMapNotice(null), 3500);
  };

  return (
    <div className="space-y-6">
      {/* Reusable General Maps Library (Maker only) */}
      {editable && (
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F151D] space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <MapIcon className="w-4 h-4 text-emerald-500" />
              <div>
                <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                  Algemene Kaartenbibliotheek (Herbruikbare dorpen)
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Sla deze kaart op als sjabloon (bijv. Dorp 1) of laad een eerder opgeslagen
                  kaart in dit dossier.
                </p>
              </div>
            </div>
            {mapNotice && (
              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                {mapNotice}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 pt-1">
            {/* Load / Update existing general map */}
            <div className="lg:col-span-7 flex flex-wrap items-center gap-2 p-2.5 rounded-lg bg-slate-50 dark:bg-[#090D12] border border-slate-200 dark:border-slate-800">
              <select
                aria-label="Opgeslagen algemene kaart kiezen"
                value={activeTemplate?.id ?? ''}
                onChange={(e) => {
                  setSelectedTemplateId(e.target.value);
                  setConfirmDeleteMap(false);
                }}
                className="flex-1 min-w-[180px] px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F151D]"
              >
                {mapTemplates.length === 0 ? (
                  <option value="">Nog geen opgeslagen kaarten</option>
                ) : (
                  mapTemplates.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.mapCols}×{m.mapRows} · {m.locations.length} locaties)
                    </option>
                  ))
                )}
              </select>

              <button
                type="button"
                disabled={!activeTemplate || mapBusy}
                onClick={() => {
                  if (!activeTemplate || !onApplyMapTemplate) return;
                  onApplyMapTemplate(activeTemplate);
                  showNotice(`Kaart "${activeTemplate.name}" ingeladen in dit dossier.`);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white transition-colors whitespace-nowrap"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span>Inladen in dossier</span>
              </button>

              <button
                type="button"
                disabled={!activeTemplate || mapBusy}
                onClick={async () => {
                  if (!activeTemplate || !onUpdateMapTemplate) return;
                  setMapBusy(true);
                  try {
                    await onUpdateMapTemplate(activeTemplate.id);
                    showNotice(`Algemene kaart "${activeTemplate.name}" bijgewerkt.`);
                  } finally {
                    setMapBusy(false);
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors whitespace-nowrap"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Bijwerken</span>
              </button>

              {activeTemplate &&
                onDeleteMapTemplate &&
                (!confirmDeleteMap ? (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteMap(true)}
                    aria-label="Algemene kaart verwijderen"
                    className="p-1.5 rounded-lg border border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <div className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      onClick={async () => {
                        setMapBusy(true);
                        try {
                          await onDeleteMapTemplate(activeTemplate.id);
                          setConfirmDeleteMap(false);
                          showNotice(`Kaart "${activeTemplate.name}" verwijderd.`);
                        } finally {
                          setMapBusy(false);
                        }
                      }}
                      className="px-2 py-1 text-[11px] font-semibold rounded bg-rose-600 text-white"
                    >
                      Verwijder
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteMap(false)}
                      className="px-2 py-1 text-[11px] rounded border border-slate-300 dark:border-slate-700"
                    >
                      Nee
                    </button>
                  </div>
                ))}
            </div>

            {/* Save current map as new reusable general map */}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!onSaveNewMapTemplate) return;
                const cleanName = newTemplateName.trim() || caseFile.townName || 'Dorp 1';
                setMapBusy(true);
                try {
                  await onSaveNewMapTemplate(cleanName);
                  setNewTemplateName('');
                  showNotice(`Kaart "${cleanName}" opgeslagen voor hergebruik.`);
                } finally {
                  setMapBusy(false);
                }
              }}
              className="lg:col-span-5 flex items-center gap-2 p-2.5 rounded-lg bg-slate-50 dark:bg-[#090D12] border border-slate-200 dark:border-slate-800"
            >
              <input
                type="text"
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                placeholder="Naam nieuwe kaart (bijv. Dorp 1)..."
                className="flex-1 min-w-[140px] px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F151D]"
              />
              <button
                type="submit"
                disabled={mapBusy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white transition-colors whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Opslaan als kaart</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F151D]">
        {editable ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 mr-1">
              Terrein tekenen:
            </span>
            {(Object.keys(TERRAIN_META) as TerrainType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setPaintTerrain(paintTerrain === t ? null : t);
                  setPlacingNew(false);
                  setMovingLocId(null);
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                  paintTerrain === t
                    ? 'bg-emerald-600 text-white border-emerald-500'
                    : 'bg-slate-50 dark:bg-[#090D12] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400'
                }`}
              >
                {TERRAIN_META[t].label}
              </button>
            ))}
            <div className="h-5 w-px bg-slate-200 dark:bg-slate-800 mx-1" />
            <button
              type="button"
              onClick={() => {
                setPlacingNew(!placingNew);
                setPaintTerrain(null);
                setMovingLocId(null);
              }}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                placingNew
                  ? 'bg-sky-600 text-white'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{placingNew ? 'Klik op de kaart...' : 'Locatie toevoegen'}</span>
            </button>
            <div className="h-5 w-px bg-slate-200 dark:bg-slate-800 mx-1" />
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#090D12] overflow-hidden">
                <button
                  type="button"
                  onClick={() => resizeMap(mapCols - 1, mapRows)}
                  disabled={mapCols <= 8}
                  aria-label="Kolom verwijderen"
                  className="px-2 py-1.5 text-xs hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="px-2.5 py-1 text-xs font-mono text-slate-700 dark:text-slate-200 whitespace-nowrap">
                  {mapCols} kolommen
                </span>
                <button
                  type="button"
                  onClick={() => resizeMap(mapCols + 1, mapRows)}
                  disabled={mapCols >= 48}
                  aria-label="Kolom toevoegen"
                  className="px-2 py-1.5 text-xs text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/15 disabled:opacity-40 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#090D12] overflow-hidden">
                <button
                  type="button"
                  onClick={() => resizeMap(mapCols, mapRows - 1)}
                  disabled={mapRows <= 6}
                  aria-label="Rij verwijderen"
                  className="px-2 py-1.5 text-xs hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="px-2.5 py-1 text-xs font-mono text-slate-700 dark:text-slate-200 whitespace-nowrap">
                  {mapRows} rijen
                </span>
                <button
                  type="button"
                  onClick={() => resizeMap(mapCols, mapRows + 1)}
                  disabled={mapRows >= 36}
                  aria-label="Rij toevoegen"
                  className="px-2 py-1.5 text-xs text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/15 disabled:opacity-40 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3 flex-1">
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Zoek adres, gebouw of bewoner..."
                className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#090D12] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#090D12] border border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setCategoryFilter('all')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  categoryFilter === 'all'
                    ? 'bg-white dark:bg-[#17202B] text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Alles
              </button>
              {(Object.keys(CATEGORY_META) as LocationCategory[]).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    categoryFilter === cat
                      ? 'bg-white dark:bg-[#17202B] text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {CATEGORY_META[cat].label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
          {caseFile.townName} · {caseFile.locations.length} locaties
        </div>
      </div>

      {/* Main Map + Inspector Split */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Map Grid Canvas */}
        <div className="xl:col-span-8 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F151D] overflow-x-auto">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Plattegrond {caseFile.townName}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {editable
                  ? placingNew
                    ? 'Klik op een vakje om de nieuwe locatie te plaatsen.'
                    : movingLocId
                    ? 'Klik op de nieuwe positie voor de geselecteerde locatie.'
                    : paintTerrain
                    ? `Actieve penseel: ${TERRAIN_META[paintTerrain].label} (klik of sleep over tegels).`
                    : 'Selecteer een penseel om het terrein te tekenen of klik op een gebouw.'
                  : 'Klik op een gebouw of plein voor adressen, bewoners en gevonden sporen.'}
              </p>
            </div>
            <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
              {mapCols}×{mapRows} sectorgrid
            </span>
          </div>

          <div
            className="relative select-none rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700"
            style={{ minWidth: Math.max(680, mapCols * 30) }}
            onMouseLeave={() => setIsPainting(false)}
            onMouseUp={() => setIsPainting(false)}
          >
            {/* Terrain Layer */}
            <div
              className="grid"
              style={{
                gridTemplateColumns: `repeat(${mapCols}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${mapRows}, 34px)`,
              }}
            >
              {Array.from({ length: mapCols * mapRows }).map((_, idx) => {
                const x = idx % mapCols;
                const y = Math.floor(idx / mapCols);
                const terrain = caseFile.terrain[idx] ?? 'grass';
                const meta = TERRAIN_META[terrain];
                return (
                  <div
                    key={idx}
                    onMouseDown={() => {
                      if (!editable) return;
                      setIsPainting(true);
                      handleTileAction(x, y);
                    }}
                    onMouseEnter={() => {
                      if (editable && isPainting && paintTerrain) {
                        handleTileAction(x, y);
                      }
                    }}
                    className={`border-[0.5px] ${meta.lightBg} dark:${meta.darkBg.split(' ')[0]} ${
                      editable && (paintTerrain || placingNew || movingLocId)
                        ? 'cursor-crosshair hover:brightness-110'
                        : ''
                    }`}
                  />
                );
              })}
            </div>

            {/* Buildings / Locations Overlay */}
            <div
              className="absolute inset-0 pointer-events-none grid"
              style={{
                gridTemplateColumns: `repeat(${mapCols}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${mapRows}, 34px)`,
              }}
            >
              {caseFile.locations.map((loc) => {
                const isSelected = loc.id === selectedLocId;
                const isDimmed = !editable && !matchingIds.has(loc.id);
                const CatIcon = CATEGORY_META[loc.category]?.Icon ?? Building2;
                return (
                  <button
                    key={loc.id}
                    type="button"
                    onClick={() => {
                      if (editable && (paintTerrain || placingNew || movingLocId)) {
                        handleTileAction(loc.x, loc.y);
                        return;
                      }
                      setSelectedLocId(loc.id);
                    }}
                    style={{
                      gridColumn: `${loc.x + 1} / span ${loc.width}`,
                      gridRow: `${loc.y + 1} / span ${loc.height}`,
                    }}
                    className={`pointer-events-auto m-0.5 rounded-md border px-2 py-1 flex flex-col justify-between text-left transition-all overflow-hidden ${
                      isSelected
                        ? 'bg-emerald-600 text-white border-emerald-300 ring-2 ring-emerald-400/60 z-10'
                        : 'bg-white/95 dark:bg-[#131B26]/95 text-slate-900 dark:text-slate-100 border-slate-400 dark:border-slate-600 hover:border-emerald-400'
                    } ${isDimmed ? 'opacity-25' : 'opacity-100'}`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className={`font-mono text-[10px] leading-none truncate ${
                          isSelected
                            ? 'text-emerald-100'
                            : 'text-emerald-700 dark:text-emerald-400'
                        }`}
                      >
                        {loc.code}
                      </span>
                      <CatIcon className="w-3.5 h-3.5 shrink-0 opacity-85" />
                    </div>
                    <div className="text-[11px] font-semibold leading-tight truncate">
                      {loc.name}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Map Legend */}
          <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
            {(Object.keys(TERRAIN_META) as TerrainType[]).map((t) => (
              <div key={t} className="inline-flex items-center gap-1.5">
                <span
                  className={`w-3 h-3 rounded-sm border ${TERRAIN_META[t].lightBg} dark:${
                    TERRAIN_META[t].darkBg.split(' ')[0]
                  }`}
                />
                <span>{TERRAIN_META[t].label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Location Inspector / Editor Panel */}
        <aside className="xl:col-span-4 p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F151D] space-y-5">
          {!selectedLocation ? (
            <div className="py-12 text-center">
              <MapPin className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Geen locatie geselecteerd
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Klik op een gebouw op de kaart om details te bekijken.
              </p>
            </div>
          ) : editable ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <span className="font-mono text-xs text-emerald-600 dark:text-emerald-400">
                    {selectedLocation.code}
                  </span>
                  <h4 className="text-base font-bold text-slate-900 dark:text-white">
                    Locatie bewerken
                  </h4>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setMovingLocId(selectedLocation.id);
                      setPaintTerrain(null);
                      setPlacingNew(false);
                    }}
                    className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                      movingLocId === selectedLocation.id
                        ? 'bg-sky-600 text-white border-sky-500'
                        : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    Verplaatsen
                  </button>
                  <button
                    type="button"
                    onClick={deleteSelectedLocation}
                    aria-label="Verwijder locatie"
                    className="p-1.5 rounded-lg border border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Code
                  </label>
                  <input
                    type="text"
                    value={selectedLocation.code}
                    onChange={(e) => updateSelectedLocation({ code: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090D12]"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Naam
                  </label>
                  <input
                    type="text"
                    value={selectedLocation.name}
                    onChange={(e) => updateSelectedLocation({ name: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090D12]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Categorie
                  </label>
                  <select
                    value={selectedLocation.category}
                    onChange={(e) =>
                      updateSelectedLocation({
                        category: e.target.value as LocationCategory,
                      })
                    }
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090D12]"
                  >
                    {(Object.keys(CATEGORY_META) as LocationCategory[]).map((cat) => (
                      <option key={cat} value={cat}>
                        {CATEGORY_META[cat].label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Grootte (B×H)
                  </label>
                  <select
                    value={`${selectedLocation.width}x${selectedLocation.height}`}
                    onChange={(e) => {
                      const [w, h] = e.target.value.split('x').map(Number);
                      updateSelectedLocation({
                        width: w,
                        height: h,
                        x: Math.min(selectedLocation.x, Math.max(0, mapCols - w)),
                        y: Math.min(selectedLocation.y, Math.max(0, mapRows - h)),
                      });
                    }}
                    className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090D12]"
                  >
                    <option value="1x1">1×1 tegel</option>
                    <option value="2x2">2×2 tegels</option>
                    <option value="3x2">3×2 tegels</option>
                    <option value="3x3">3×3 tegels</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Adres
                </label>
                <input
                  type="text"
                  value={selectedLocation.address}
                  onChange={(e) => updateSelectedLocation({ address: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090D12]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Beschrijving
                </label>
                <textarea
                  rows={2}
                  value={selectedLocation.description}
                  onChange={(e) => updateSelectedLocation({ description: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090D12]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Politie-notitie (zichtbaar voor spelers)
                </label>
                <textarea
                  rows={2}
                  value={selectedLocation.publicNote}
                  onChange={(e) => updateSelectedLocation({ publicNote: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090D12]"
                />
              </div>

              <button
                type="button"
                onClick={() =>
                  updateSelectedLocation({
                    visibleToPlayers: !selectedLocation.visibleToPlayers,
                  })
                }
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                {selectedLocation.visibleToPlayers ? (
                  <>
                    <Eye className="w-4 h-4 text-emerald-500" />
                    <span>Zichtbaar voor spelers</span>
                  </>
                ) : (
                  <>
                    <EyeOff className="w-4 h-4 text-amber-500" />
                    <span>Verborgen voor spelers</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="pb-3 border-b border-slate-200 dark:border-slate-800">
                <div className="text-xs font-mono text-emerald-600 dark:text-emerald-400">
                  {selectedLocation.code} · {CATEGORY_META[selectedLocation.category]?.label}
                </div>
                <h4 className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">
                  {selectedLocation.name}
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {selectedLocation.address}
                </p>
              </div>

              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                {selectedLocation.description}
              </p>

              {selectedLocation.publicNote && (
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#090D12] border border-slate-200 dark:border-slate-800">
                  <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1">
                    Politie-observatie
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {selectedLocation.publicNote}
                  </p>
                </div>
              )}

              <div>
                <h5 className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-2">
                  Gekoppelde personen ({linkedPersons.length})
                </h5>
                {linkedPersons.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Geen geregistreerde personen op dit adres.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {linkedPersons.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => onSelectPerson?.(p)}
                        className="w-full text-left p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-emerald-500/60 bg-slate-50 dark:bg-[#090D12] transition-colors"
                      >
                        <div className="text-xs font-semibold text-slate-900 dark:text-white">
                          {p.name}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {p.occupation} · {p.fingerprintCode}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h5 className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-2">
                  Bewijsstukken op deze locatie ({linkedEvidence.length})
                </h5>
                {linkedEvidence.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Geen sporen aangetroffen.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {linkedEvidence.map((ev) => (
                      <button
                        key={ev.id}
                        type="button"
                        onClick={() => onSelectEvidence?.(ev)}
                        className="w-full text-left p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-emerald-500/60 bg-slate-50 dark:bg-[#090D12] transition-colors"
                      >
                        <div className="text-xs font-semibold text-slate-900 dark:text-white">
                          {ev.code} — {ev.title}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {ev.stamps.length} vingerafdrukspoor(en)
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};
