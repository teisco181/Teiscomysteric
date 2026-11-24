import React, { useMemo, useState } from 'react';
import {
  Anchor,
  ArrowRight,
  Building2,
  Check,
  CircleDashed,
  Coffee,
  Compass,
  Eye,
  EyeOff,
  FolderOpen,
  Grid2X2,
  Home,
  Landmark,
  Map as MapIcon,
  MapPin,
  Minus,
  Plane,
  Plus,
  Save,
  Search,
  Shield,
  Store,
  Trash2,
  Trees,
  User,
  X,
} from 'lucide-react';
import { findLocationByImportCode } from '../utils/personImport.ts';
import {
  MAP_COLS,
  MAP_ROWS,
  type CaseFile,
  type EvidenceItem,
  type LocationCategory,
  type MapLocation,
  type MapLocationKind,
  type MapTemplate,
  type MapTileCoord,
  type Person,
  type TerrainType,
  type ZoneColor,
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
  park: { label: 'Park / Natuur', Icon: Trees },
  airport: { label: 'Vliegveld / Vervoer', Icon: Plane },
  district: { label: 'Wijk / Gebied', Icon: Compass },
};

const ZONE_COLOR_META: Record<
  ZoneColor,
  {
    label: string;
    borderColor: string;
    selectedBorderColor: string;
    bgColor: string;
    selectedBgColor: string;
    badge: string;
    swatch: string;
  }
> = {
  emerald: {
    label: 'Groen (Park)',
    borderColor: 'border-emerald-500/85',
    selectedBorderColor: 'border-emerald-300',
    bgColor: 'bg-emerald-500/20 hover:bg-emerald-500/30',
    selectedBgColor: 'bg-emerald-500/35',
    badge: 'bg-emerald-600 text-white border-emerald-400',
    swatch: 'bg-emerald-500',
  },
  sky: {
    label: 'Blauw (Vliegveld / Water)',
    borderColor: 'border-sky-500/85',
    selectedBorderColor: 'border-sky-300',
    bgColor: 'bg-sky-500/20 hover:bg-sky-500/30',
    selectedBgColor: 'bg-sky-500/35',
    badge: 'bg-sky-600 text-white border-sky-400',
    swatch: 'bg-sky-500',
  },
  amber: {
    label: 'Amber (Terrein / Industrie)',
    borderColor: 'border-amber-500/85',
    selectedBorderColor: 'border-amber-300',
    bgColor: 'bg-amber-500/20 hover:bg-amber-500/30',
    selectedBgColor: 'bg-amber-500/35',
    badge: 'bg-amber-600 text-white border-amber-400',
    swatch: 'bg-amber-500',
  },
  rose: {
    label: 'Rood (Verboden / Delict)',
    borderColor: 'border-rose-500/85',
    selectedBorderColor: 'border-rose-300',
    bgColor: 'bg-rose-500/20 hover:bg-rose-500/30',
    selectedBgColor: 'bg-rose-500/35',
    badge: 'bg-rose-600 text-white border-rose-400',
    swatch: 'bg-rose-500',
  },
  violet: {
    label: 'Paars (Evenement / Zone)',
    borderColor: 'border-violet-500/85',
    selectedBorderColor: 'border-violet-300',
    bgColor: 'bg-violet-500/20 hover:bg-violet-500/30',
    selectedBgColor: 'bg-violet-500/35',
    badge: 'bg-violet-600 text-white border-violet-400',
    swatch: 'bg-violet-500',
  },
};

const BUILDING_COLOR_META: Record<
  ZoneColor,
  {
    label: string;
    card: string;
    selectedCard: string;
    code: string;
    selectedCode: string;
  }
> = {
  emerald: {
    label: 'Groen',
    card: 'bg-emerald-50/95 dark:bg-emerald-950/90 text-emerald-950 dark:text-emerald-100 border-emerald-500/80 hover:border-emerald-400',
    selectedCard: 'bg-emerald-600 text-white border-emerald-300 ring-2 ring-emerald-400/70 z-20',
    code: 'text-emerald-700 dark:text-emerald-300',
    selectedCode: 'text-emerald-100',
  },
  sky: {
    label: 'Blauw',
    card: 'bg-sky-50/95 dark:bg-sky-950/90 text-sky-950 dark:text-sky-100 border-sky-500/80 hover:border-sky-400',
    selectedCard: 'bg-sky-600 text-white border-sky-300 ring-2 ring-sky-400/70 z-20',
    code: 'text-sky-700 dark:text-sky-300',
    selectedCode: 'text-sky-100',
  },
  amber: {
    label: 'Amber',
    card: 'bg-amber-50/95 dark:bg-amber-950/90 text-amber-950 dark:text-amber-100 border-amber-500/80 hover:border-amber-400',
    selectedCard: 'bg-amber-600 text-white border-amber-300 ring-2 ring-amber-400/70 z-20',
    code: 'text-amber-700 dark:text-amber-300',
    selectedCode: 'text-amber-100',
  },
  rose: {
    label: 'Rood',
    card: 'bg-rose-50/95 dark:bg-rose-950/90 text-rose-950 dark:text-rose-100 border-rose-500/80 hover:border-rose-400',
    selectedCard: 'bg-rose-600 text-white border-rose-300 ring-2 ring-rose-400/70 z-20',
    code: 'text-rose-700 dark:text-rose-300',
    selectedCode: 'text-rose-100',
  },
  violet: {
    label: 'Paars',
    card: 'bg-violet-50/95 dark:bg-violet-950/90 text-violet-950 dark:text-violet-100 border-violet-500/80 hover:border-violet-400',
    selectedCard: 'bg-violet-600 text-white border-violet-300 ring-2 ring-violet-400/70 z-20',
    code: 'text-violet-700 dark:text-violet-300',
    selectedCode: 'text-violet-100',
  },
};

function getLocationKind(loc: MapLocation): MapLocationKind {
  return loc.kind === 'zone' ? 'zone' : 'building';
}

function isHouseLocation(loc: MapLocation): boolean {
  return loc.category === 'house' || /^h[-\s]?\d+/i.test((loc.code ?? '').trim());
}

function tileKey(x: number, y: number): string {
  return `${x},${y}`;
}

function getLocationCells(
  loc: MapLocation,
  mapCols: number,
  mapRows: number
): MapTileCoord[] {
  if (Array.isArray(loc.cells) && loc.cells.length > 0) {
    const seen = new Set<string>();
    const valid: MapTileCoord[] = [];
    for (const c of loc.cells) {
      const cx = Math.floor(Number(c.x));
      const cy = Math.floor(Number(c.y));
      if (cx < 0 || cx >= mapCols || cy < 0 || cy >= mapRows) continue;
      const k = tileKey(cx, cy);
      if (!seen.has(k)) {
        seen.add(k);
        valid.push({ x: cx, y: cy });
      }
    }
    if (valid.length > 0) return valid;
  }

  const cells: MapTileCoord[] = [];
  const startX = Math.max(0, Math.min(mapCols - 1, loc.x));
  const startY = Math.max(0, Math.min(mapRows - 1, loc.y));
  const endX = Math.min(mapCols, startX + Math.max(1, loc.width));
  const endY = Math.min(mapRows, startY + Math.max(1, loc.height));
  for (let cy = startY; cy < endY; cy++) {
    for (let cx = startX; cx < endX; cx++) {
      cells.push({ x: cx, y: cy });
    }
  }
  return cells;
}

function computeBoundingBox(cells: MapTileCoord[]): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  if (cells.length === 0) return { x: 0, y: 0, width: 1, height: 1 };
  let minX = cells[0].x;
  let maxX = cells[0].x;
  let minY = cells[0].y;
  let maxY = cells[0].y;
  for (const c of cells) {
    if (c.x < minX) minX = c.x;
    if (c.x > maxX) maxX = c.x;
    if (c.y < minY) minY = c.y;
    if (c.y > maxY) maxY = c.y;
  }
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX + 1),
    height: Math.max(1, maxY - minY + 1),
  };
}

function isTileInLocation(
  x: number,
  y: number,
  loc: MapLocation,
  mapCols: number,
  mapRows: number
): boolean {
  if (getLocationKind(loc) === 'zone' && Array.isArray(loc.cells) && loc.cells.length > 0) {
    return getLocationCells(loc, mapCols, mapRows).some(
      (c) => c.x === x && c.y === y
    );
  }
  return x >= loc.x && x < loc.x + loc.width && y >= loc.y && y < loc.y + loc.height;
}

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
  const [placeMode, setPlaceMode] = useState<MapLocationKind | null>(null);
  const [selectedTiles, setSelectedTiles] = useState<MapTileCoord[]>([]);
  const [tileDragMode, setTileDragMode] = useState<'add' | 'remove' | null>(null);
  const [movingLocId, setMovingLocId] = useState<string | null>(null);
  const [isPainting, setIsPainting] = useState(false);
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<'all' | MapLocationKind>('all');
  const [categoryFilter, setCategoryFilter] = useState<LocationCategory | 'all'>('all');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    mapTemplates[0]?.id ?? ''
  );
  const [newTemplateName, setNewTemplateName] = useState('');
  const [mapBusy, setMapBusy] = useState(false);
  const [mapNotice, setMapNotice] = useState<string | null>(null);
  const [confirmDeleteMap, setConfirmDeleteMap] = useState(false);
  const [hoveredTile, setHoveredTile] = useState<{ x: number; y: number } | null>(null);

  const selectedLocation = useMemo(
    () => caseFile.locations.find((l) => l.id === selectedLocId) ?? null,
    [caseFile.locations, selectedLocId]
  );

  const buildingLocations = useMemo(
    () => caseFile.locations.filter((l) => getLocationKind(l) === 'building'),
    [caseFile.locations]
  );

  const zoneLocations = useMemo(
    () => caseFile.locations.filter((l) => getLocationKind(l) === 'zone'),
    [caseFile.locations]
  );

  const filteredLocations = useMemo(() => {
    const q = search.trim().toLowerCase();
    return caseFile.locations.filter((loc) => {
      if (kindFilter !== 'all' && getLocationKind(loc) !== kindFilter) return false;
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
        loc.description.toLowerCase().includes(q) ||
        matchesPerson
      );
    });
  }, [caseFile.locations, caseFile.persons, search, kindFilter, categoryFilter]);

  const matchingIds = useMemo(
    () => new Set(filteredLocations.map((l) => l.id)),
    [filteredLocations]
  );

  const mapCols = Math.max(8, Math.min(48, caseFile.mapCols || MAP_COLS));
  const mapRows = Math.max(6, Math.min(36, caseFile.mapRows || MAP_ROWS));

  const hoveredLocations = useMemo(() => {
    if (!hoveredTile) return [];
    const matches = caseFile.locations.filter((loc) =>
      isTileInLocation(hoveredTile.x, hoveredTile.y, loc, mapCols, mapRows)
    );
    // Show solid buildings before enclosing POV zones
    return matches.sort((a, b) => {
      const ka = getLocationKind(a) === 'building' ? 0 : 1;
      const kb = getLocationKind(b) === 'building' ? 0 : 1;
      return ka - kb;
    });
  }, [hoveredTile, caseFile.locations, mapCols, mapRows]);

  const selectedTileKeys = useMemo(
    () => new Set(selectedTiles.map((c) => tileKey(c.x, c.y))),
    [selectedTiles]
  );

  const toggleSelectionTile = (x: number, y: number, mode: 'add' | 'remove') => {
    const key = tileKey(x, y);
    setSelectedTiles((prev) => {
      const exists = prev.some((c) => tileKey(c.x, c.y) === key);
      if (mode === 'add') {
        return exists ? prev : [...prev, { x, y }];
      }
      return exists ? prev.filter((c) => tileKey(c.x, c.y) !== key) : prev;
    });
  };

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
      if (Array.isArray(loc.cells) && loc.cells.length > 0) {
        const clampedCells = loc.cells.map((c) => ({
          x: Math.max(0, Math.min(clampedCols - 1, c.x)),
          y: Math.max(0, Math.min(clampedRows - 1, c.y)),
        }));
        const unique = Array.from(
          new Map(clampedCells.map((c) => [tileKey(c.x, c.y), c])).values()
        );
        return {
          ...loc,
          cells: unique,
          ...computeBoundingBox(unique),
        };
      }
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

  const createNewZoneFromSelectedTiles = () => {
    if (!editable || !onUpdateCase || selectedTiles.length === 0) return;
    const box = computeBoundingBox(selectedTiles);
    const nextIndex = zoneLocations.length + 1;
    const nextCode = `POV-${String(nextIndex).padStart(2, '0')}`;
    const created: MapLocation = {
      id: `pov-${Date.now().toString(36)}`,
      code: nextCode,
      name: `Nieuw Gebied (POV) ${nextIndex}`,
      category: 'park',
      kind: 'zone',
      zoneColor: 'emerald',
      cells: selectedTiles,
      ...box,
      address: `${caseFile.townName} — Sector ${nextIndex}`,
      description: 'Vrij geselecteerd gebied / POV op de kaart (bijv. park of vliegveld).',
      publicNote: '',
      visibleToPlayers: true,
    };

    onUpdateCase({
      ...caseFile,
      locations: [...caseFile.locations, created],
    });
    setSelectedLocId(created.id);
    setSelectedTiles([]);
    setTileDragMode(null);
    setPlaceMode(null);
    showNotice(`Nieuw gebied "${created.name}" (${selectedTiles.length} vakken) aangemaakt.`);
  };

  const addSelectedTilesToZone = () => {
    if (
      !editable ||
      !onUpdateCase ||
      !selectedLocation ||
      getLocationKind(selectedLocation) !== 'zone' ||
      selectedTiles.length === 0
    ) {
      return;
    }
    const baseCells = getLocationCells(selectedLocation, mapCols, mapRows);
    const mergedMap = new Map<string, MapTileCoord>();
    for (const c of baseCells) mergedMap.set(tileKey(c.x, c.y), c);
    for (const c of selectedTiles) mergedMap.set(tileKey(c.x, c.y), c);
    const merged = Array.from(mergedMap.values());
    const box = computeBoundingBox(merged);
    const addedCount = merged.length - baseCells.length;

    updateSelectedLocation({
      cells: merged,
      ...box,
    });
    setSelectedTiles([]);
    setTileDragMode(null);
    showNotice(
      addedCount > 0
        ? `${addedCount} vak(ken) toegevoegd aan "${selectedLocation.name}".`
        : `Geselecteerde vakken behoorden al tot "${selectedLocation.name}".`
    );
  };

  const removeSelectedTilesFromZone = () => {
    if (
      !editable ||
      !onUpdateCase ||
      !selectedLocation ||
      getLocationKind(selectedLocation) !== 'zone' ||
      selectedTiles.length === 0
    ) {
      return;
    }
    const baseCells = getLocationCells(selectedLocation, mapCols, mapRows);
    const removeKeys = new Set(selectedTiles.map((c) => tileKey(c.x, c.y)));
    const remaining = baseCells.filter((c) => !removeKeys.has(tileKey(c.x, c.y)));
    if (remaining.length === 0) {
      showNotice('Een gebied moet minimaal 1 vak behouden.');
      return;
    }
    const box = computeBoundingBox(remaining);
    const removedCount = baseCells.length - remaining.length;

    updateSelectedLocation({
      cells: remaining,
      ...box,
    });
    setSelectedTiles([]);
    setTileDragMode(null);
    if (removedCount > 0) {
      showNotice(`${removedCount} vak(ken) verwijderd uit "${selectedLocation.name}".`);
    }
  };

  const handleTileAction = (x: number, y: number) => {
    if (!editable || !onUpdateCase) return;

    if (placeMode === 'building') {
      const nextIndex = buildingLocations.length + 1;
      const nextCode = `LOC-${String(caseFile.locations.length + 1).padStart(2, '0')}`;
      const created: MapLocation = {
        id: `loc-${Date.now().toString(36)}`,
        code: nextCode,
        name: `Nieuw Gebouw ${nextIndex}`,
        category: 'house',
        kind: 'building',
        x: Math.min(x, Math.max(0, mapCols - 2)),
        y: Math.min(y, Math.max(0, mapRows - 2)),
        width: 2,
        height: 2,
        address: `Dorpsstraat ${nextIndex}`,
        description: 'Nieuw gebouw op de kaart.',
        publicNote: '',
        visibleToPlayers: true,
      };
      onUpdateCase({
        ...caseFile,
        locations: [...caseFile.locations, created],
      });
      setSelectedLocId(created.id);
      setPlaceMode(null);
      return;
    }

    if (movingLocId) {
      const nextLocs = caseFile.locations.map((loc) => {
        if (loc.id !== movingLocId) return loc;
        const targetX = Math.min(x, Math.max(0, mapCols - loc.width));
        const targetY = Math.min(y, Math.max(0, mapRows - loc.height));
        const dx = targetX - loc.x;
        const dy = targetY - loc.y;
        if (Array.isArray(loc.cells) && loc.cells.length > 0) {
          const shifted = loc.cells.map((c) => ({ x: c.x + dx, y: c.y + dy }));
          return {
            ...loc,
            cells: shifted,
            ...computeBoundingBox(shifted),
          };
        }
        return {
          ...loc,
          x: targetX,
          y: targetY,
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
    return caseFile.persons.filter((p) => {
      if (p.locationId === selectedLocation.id) return true;
      if (!p.locationId && p.address) {
        return (
          findLocationByImportCode(p.address, [selectedLocation]).matchedLocation?.id ===
          selectedLocation.id
        );
      }
      return false;
    });
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

  const selectedKind: MapLocationKind = selectedLocation
    ? getLocationKind(selectedLocation)
    : 'building';

  const isInteractiveOverlayDisabled =
    editable && (Boolean(paintTerrain) || Boolean(placeMode) || Boolean(movingLocId));

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
                  Sla deze kaart (inclusief gebouwen &amp; omcirkelde POV-gebieden) op als sjabloon
                  of laad een eerder opgeslagen kaart in dit dossier.
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
                  setPlaceMode(null);
                  setSelectedTiles([]);
                  setTileDragMode(null);
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
                setPlaceMode(placeMode === 'building' ? null : 'building');
                setPaintTerrain(null);
                setSelectedTiles([]);
                setTileDragMode(null);
                setMovingLocId(null);
              }}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                placeMode === 'building'
                  ? 'bg-sky-600 text-white'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>
                {placeMode === 'building' ? 'Klik op de kaart...' : 'Gebouw toevoegen'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                const next = placeMode === 'zone' ? null : 'zone';
                setPlaceMode(next);
                setPaintTerrain(null);
                if (!next) {
                  setSelectedTiles([]);
                  setTileDragMode(null);
                }
                setMovingLocId(null);
              }}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                placeMode === 'zone'
                  ? 'bg-sky-600 text-white border-sky-500'
                  : 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20'
              }`}
            >
              <Grid2X2 className="w-3.5 h-3.5" />
              <span>
                {placeMode === 'zone'
                  ? 'Vakken selecteren actief'
                  : 'Gebied (POV) vakken'}
              </span>
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
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Zoek gebouw, gebied, park of bewoner..."
                className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#090D12] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#090D12] border border-slate-200 dark:border-slate-800">
              {(
                [
                  { id: 'all', label: 'Alles' },
                  { id: 'building', label: 'Gebouwen' },
                  { id: 'zone', label: 'Gebieden (POV)' },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setKindFilter(item.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    kindFilter === item.id
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              ))}
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
                Alle categorieën
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
          {caseFile.townName} · {buildingLocations.length} gebouwen · {zoneLocations.length} POV
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
                  ? placeMode === 'building'
                    ? 'Klik op een vakje om een nieuw gebouw te plaatsen.'
                    : placeMode === 'zone'
                    ? 'Klik of sleep over de kaart om losse vakken te selecteren en toe te voegen aan een POV-gebied.'
                    : movingLocId
                    ? 'Klik op de nieuwe positie voor de geselecteerde locatie.'
                    : paintTerrain
                    ? `Actieve penseel: ${TERRAIN_META[paintTerrain].label} (klik of sleep over tegels).`
                    : 'Teken terrein, voeg gebouwen toe of selecteer vakken voor gebieden (POV).'
                  : 'Klik op een gebouw of gebied (POV) voor details, bewoners en gevonden sporen.'}
              </p>
            </div>
            <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
              {mapCols}×{mapRows} sectorgrid
            </span>
          </div>

          {editable && placeMode === 'zone' && (
            <div className="mb-3 p-3 rounded-lg border border-sky-500/40 bg-sky-500/10 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs">
                <Grid2X2 className="w-4 h-4 text-sky-500 shrink-0" />
                <span className="font-semibold text-slate-900 dark:text-white">
                  {selectedTiles.length}{' '}
                  {selectedTiles.length === 1 ? 'vak' : 'vakken'} geselecteerd
                </span>
                <span className="text-slate-600 dark:text-slate-300 hidden sm:inline">
                  — Klik of sleep over vakken op de kaart om ze te (de)selecteren.
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {selectedLocation && selectedKind === 'zone' && (
                  <>
                    <button
                      type="button"
                      disabled={selectedTiles.length === 0}
                      onClick={addSelectedTilesToZone}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Toevoegen aan {selectedLocation.code}</span>
                    </button>
                    <button
                      type="button"
                      disabled={selectedTiles.length === 0}
                      onClick={removeSelectedTilesFromZone}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-rose-500/40 text-rose-700 dark:text-rose-300 hover:bg-rose-500/15 disabled:opacity-40 transition-colors"
                    >
                      <Minus className="w-3.5 h-3.5" />
                      <span>Uit {selectedLocation.code} halen</span>
                    </button>
                  </>
                )}

                <button
                  type="button"
                  disabled={selectedTiles.length === 0}
                  onClick={createNewZoneFromSelectedTiles}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white transition-colors"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Nieuw gebied maken</span>
                </button>

                {selectedTiles.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedTiles([])}
                    className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
                  >
                    Wis selectie
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setPlaceMode(null);
                    setSelectedTiles([]);
                    setTileDragMode(null);
                  }}
                  aria-label="Sluit vakken selecteren"
                  className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          <div
            className="relative select-none rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700"
            style={{ minWidth: Math.max(680, mapCols * 30) }}
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              if (rect.width <= 0 || rect.height <= 0) return;
              const relX = Math.max(0, Math.min(0.9999, (e.clientX - rect.left) / rect.width));
              const relY = Math.max(0, Math.min(0.9999, (e.clientY - rect.top) / rect.height));
              const tx = Math.floor(relX * mapCols);
              const ty = Math.floor(relY * mapRows);
              setHoveredTile((prev) =>
                prev && prev.x === tx && prev.y === ty ? prev : { x: tx, y: ty }
              );
            }}
            onMouseLeave={() => {
              setIsPainting(false);
              setTileDragMode(null);
              setHoveredTile(null);
            }}
            onMouseUp={() => {
              setIsPainting(false);
              setTileDragMode(null);
            }}
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
                      if (placeMode === 'zone') {
                        const alreadySelected = selectedTileKeys.has(tileKey(x, y));
                        const mode: 'add' | 'remove' = alreadySelected ? 'remove' : 'add';
                        setTileDragMode(mode);
                        toggleSelectionTile(x, y, mode);
                        return;
                      }
                      setIsPainting(true);
                      handleTileAction(x, y);
                    }}
                    onMouseEnter={() => {
                      if (!editable) return;
                      if (placeMode === 'zone' && tileDragMode) {
                        toggleSelectionTile(x, y, tileDragMode);
                        return;
                      }
                      if (isPainting && paintTerrain) {
                        handleTileAction(x, y);
                      }
                    }}
                    className={`border-[0.5px] ${meta.lightBg} dark:${meta.darkBg.split(' ')[0]} ${
                      editable && (paintTerrain || placeMode || movingLocId)
                        ? 'cursor-crosshair hover:brightness-110'
                        : ''
                    }`}
                  />
                );
              })}
            </div>

            {/* Layer 2: Multi-tile POV Zones (behind buildings) */}
            <div
              className="absolute inset-0 pointer-events-none grid z-[5]"
              style={{
                gridTemplateColumns: `repeat(${mapCols}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${mapRows}, 34px)`,
              }}
            >
              {zoneLocations.map((zone) => {
                const isSelected = zone.id === selectedLocId;
                const isDimmed = !editable && !matchingIds.has(zone.id);
                const CatIcon = CATEGORY_META[zone.category]?.Icon ?? CircleDashed;
                const colorMeta =
                  ZONE_COLOR_META[zone.zoneColor ?? 'emerald'] ??
                  ZONE_COLOR_META.emerald;
                const cells = getLocationCells(zone, mapCols, mapRows);
                const cellSet = new Set(cells.map((c) => tileKey(c.x, c.y)));
                const sortedCells = [...cells].sort((a, b) =>
                  a.y !== b.y ? a.y - b.y : a.x - b.x
                );
                const anchorCell = sortedCells[0];

                return (
                  <React.Fragment key={zone.id}>
                    {cells.map((cell) => {
                      const hasTop = cellSet.has(tileKey(cell.x, cell.y - 1));
                      const hasRight = cellSet.has(tileKey(cell.x + 1, cell.y));
                      const hasBottom = cellSet.has(tileKey(cell.x, cell.y + 1));
                      const hasLeft = cellSet.has(tileKey(cell.x - 1, cell.y));

                      const borderSides = [
                        !hasTop ? 'border-t-2' : '',
                        !hasRight ? 'border-r-2' : '',
                        !hasBottom ? 'border-b-2' : '',
                        !hasLeft ? 'border-l-2' : '',
                      ]
                        .filter(Boolean)
                        .join(' ');

                      const outerCorners = [
                        !hasTop && !hasLeft ? 'rounded-tl-xl' : '',
                        !hasTop && !hasRight ? 'rounded-tr-xl' : '',
                        !hasBottom && !hasRight ? 'rounded-br-xl' : '',
                        !hasBottom && !hasLeft ? 'rounded-bl-xl' : '',
                      ]
                        .filter(Boolean)
                        .join(' ');

                      return (
                        <button
                          key={`${zone.id}-${cell.x}-${cell.y}`}
                          type="button"
                          aria-label={`${zone.name} (${cell.x},${cell.y})`}
                          onClick={() => {
                            if (isInteractiveOverlayDisabled) return;
                            setSelectedLocId(zone.id);
                          }}
                          style={{
                            gridColumn: `${cell.x + 1} / span 1`,
                            gridRow: `${cell.y + 1} / span 1`,
                          }}
                          className={`${
                            isInteractiveOverlayDisabled
                              ? 'pointer-events-none'
                              : 'pointer-events-auto'
                          } border-dashed transition-colors ${borderSides} ${outerCorners} ${
                            isSelected
                              ? `${colorMeta.selectedBorderColor} ${colorMeta.selectedBgColor} z-[8]`
                              : `${colorMeta.borderColor} ${colorMeta.bgColor}`
                          } ${isDimmed ? 'opacity-20' : 'opacity-100'}`}
                        />
                      );
                    })}

                    {anchorCell && (
                      <div
                        style={{
                          gridColumn: `${anchorCell.x + 1} / span ${Math.max(
                            1,
                            Math.min(mapCols - anchorCell.x, Math.max(2, zone.width))
                          )}`,
                          gridRow: `${anchorCell.y + 1} / span 1`,
                        }}
                        className={`pointer-events-none z-[9] flex items-start justify-start p-1 ${
                          isDimmed ? 'opacity-25' : 'opacity-100'
                        }`}
                      >
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold shadow-sm whitespace-nowrap ${colorMeta.badge}`}
                        >
                          <CatIcon className="w-3 h-3 shrink-0" />
                          <span className="font-mono shrink-0">{zone.code}</span>
                          <span className="truncate max-w-[160px]">{zone.name}</span>
                        </span>
                      </div>
                    )}
                  </React.Fragment>
                );
              })}

              {/* Live preview of individually selected tiles for POV creation/editing */}
              {placeMode === 'zone' &&
                selectedTiles.map((cell) => (
                  <div
                    key={`sel-${cell.x}-${cell.y}`}
                    style={{
                      gridColumn: `${cell.x + 1} / span 1`,
                      gridRow: `${cell.y + 1} / span 1`,
                    }}
                    className="pointer-events-none m-0.5 rounded-md border-2 border-sky-400 bg-sky-500/35 z-[15] flex items-center justify-center shadow-xs"
                  >
                    <span className="w-2 h-2 rounded-full bg-white shadow" />
                  </div>
                ))}
            </div>

            {/* Layer 3: Solid Buildings Overlay (above circled POV zones) */}
            <div
              className="absolute inset-0 pointer-events-none grid z-10"
              style={{
                gridTemplateColumns: `repeat(${mapCols}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${mapRows}, 34px)`,
              }}
            >
              {buildingLocations.map((loc) => {
                const isSelected = loc.id === selectedLocId;
                const isDimmed = !editable && !matchingIds.has(loc.id);
                const CatIcon = CATEGORY_META[loc.category]?.Icon ?? Building2;
                const colorTheme = loc.zoneColor
                  ? BUILDING_COLOR_META[loc.zoneColor]
                  : undefined;
                const cardClasses = isSelected
                  ? colorTheme?.selectedCard ??
                    'bg-emerald-600 text-white border-emerald-300 ring-2 ring-emerald-400/60 z-20'
                  : colorTheme?.card ??
                    'bg-white/95 dark:bg-[#131B26]/95 text-slate-900 dark:text-slate-100 border-slate-400 dark:border-slate-600 hover:border-emerald-400';
                const codeClasses = isSelected
                  ? colorTheme?.selectedCode ?? 'text-emerald-100'
                  : colorTheme?.code ?? 'text-emerald-700 dark:text-emerald-400';

                return (
                  <button
                    key={loc.id}
                    type="button"
                    onClick={() => {
                      if (isInteractiveOverlayDisabled) {
                        handleTileAction(loc.x, loc.y);
                        return;
                      }
                      setSelectedLocId(loc.id);
                    }}
                    style={{
                      gridColumn: `${loc.x + 1} / span ${loc.width}`,
                      gridRow: `${loc.y + 1} / span ${loc.height}`,
                    }}
                    className={`${
                      placeMode === 'zone' ? 'pointer-events-none' : 'pointer-events-auto'
                    } m-0.5 rounded-md border px-2 py-1 flex flex-col justify-between text-left transition-all overflow-hidden ${cardClasses} ${
                      isDimmed ? 'opacity-25' : 'opacity-100'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className={`font-mono text-[10px] leading-none truncate ${codeClasses}`}
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

            {/* Layer 4: Hover Tooltip for Location Name & Type */}
            {hoveredTile &&
              hoveredLocations.length > 0 &&
              !isPainting &&
              !tileDragMode && (
                <div
                  role="tooltip"
                  style={{
                    left: `${((hoveredTile.x + 0.5) / mapCols) * 100}%`,
                    top:
                      hoveredTile.y <= 1
                        ? `calc(${((hoveredTile.y + 1) / mapRows) * 100}% + 6px)`
                        : `calc(${(hoveredTile.y / mapRows) * 100}% - 6px)`,
                  }}
                  className={`pointer-events-none absolute z-30 w-max max-w-[260px] rounded-lg border border-slate-700/90 bg-slate-900/95 px-3 py-2 text-left text-white shadow-xl backdrop-blur-xs ${
                    hoveredTile.x <= 2
                      ? 'translate-x-0'
                      : hoveredTile.x >= mapCols - 3
                      ? '-translate-x-full'
                      : '-translate-x-1/2'
                  } ${hoveredTile.y <= 1 ? '' : '-translate-y-full'}`}
                >
                  <div className="space-y-1.5">
                    {hoveredLocations.map((loc, idx) => {
                      const kind = getLocationKind(loc);
                      const catLabel = CATEGORY_META[loc.category]?.label ?? 'Locatie';
                      const typeLabel =
                        kind === 'zone'
                          ? `Gebied (POV) · ${catLabel}`
                          : `Gebouw · ${catLabel}`;
                      return (
                        <div
                          key={loc.id}
                          className={
                            idx > 0 ? 'pt-1.5 border-t border-slate-700/80' : undefined
                          }
                        >
                          <div className="flex items-center gap-1.5 text-[11px] font-semibold leading-tight text-white">
                            <span className="font-mono text-[10px] text-emerald-400 shrink-0">
                              {loc.code}
                            </span>
                            <span className="truncate">{loc.name}</span>
                          </div>
                          <div className="text-[10px] text-slate-300 mt-0.5">
                            Type: {typeLabel}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
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
            <div className="inline-flex items-center gap-1.5">
              <span className="w-4 h-3 rounded-full border-2 border-dashed border-emerald-500 bg-emerald-500/15" />
              <span>Omcirkeld gebied (POV)</span>
            </div>
          </div>
        </div>

        {/* Location Inspector / Editor Panel */}
        <aside className="xl:col-span-4 p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F151D] space-y-5">
          {!selectedLocation ? (
            <div className="py-12 text-center">
              <MapPin className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Geen locatie of gebied geselecteerd
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Klik op een gebouw of omcirkeld gebied op de kaart om details te bekijken.
              </p>
            </div>
          ) : editable ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <span className="font-mono text-xs text-emerald-600 dark:text-emerald-400">
                    {selectedLocation.code} ·{' '}
                    {selectedKind === 'zone' ? 'Gebied / POV' : 'Gebouw'}
                  </span>
                  <h4 className="text-base font-bold text-slate-900 dark:text-white">
                    {selectedKind === 'zone' ? 'Gebied (POV) bewerken' : 'Gebouw bewerken'}
                  </h4>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setMovingLocId(selectedLocation.id);
                      setPaintTerrain(null);
                      setPlaceMode(null);
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

              {/* Type switcher: Building vs Tile-Based POV Zone */}
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-lg bg-slate-100 dark:bg-[#090D12] border border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() =>
                    updateSelectedLocation({
                      kind: 'building',
                      cells: undefined,
                    })
                  }
                  className={`inline-flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    selectedKind === 'building'
                      ? 'bg-white dark:bg-[#17202B] text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  <Building2 className="w-3.5 h-3.5" />
                  <span>Gebouw</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const cells = getLocationCells(selectedLocation, mapCols, mapRows);
                    updateSelectedLocation({
                      kind: 'zone',
                      zoneColor: selectedLocation.zoneColor ?? 'emerald',
                      cells,
                      ...computeBoundingBox(cells),
                    });
                  }}
                  className={`inline-flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    selectedKind === 'zone'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  <CircleDashed className="w-3.5 h-3.5" />
                  <span>Gebied (POV)</span>
                </button>
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

                {selectedKind === 'building' ? (
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
                      {!['1x1', '2x2', '3x2', '3x3'].includes(
                        `${selectedLocation.width}x${selectedLocation.height}`
                      ) && (
                        <option value={`${selectedLocation.width}x${selectedLocation.height}`}>
                          {selectedLocation.width}×{selectedLocation.height} tegels
                        </option>
                      )}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Cirkelkleur (POV)
                    </label>
                    <div className="flex items-center gap-1.5 pt-1">
                      {(Object.keys(ZONE_COLOR_META) as ZoneColor[]).map((colorKey) => {
                        const activeColor =
                          (selectedLocation.zoneColor ?? 'emerald') === colorKey;
                        return (
                          <button
                            key={colorKey}
                            type="button"
                            title={ZONE_COLOR_META[colorKey].label}
                            onClick={() => updateSelectedLocation({ zoneColor: colorKey })}
                            className={`w-6 h-6 rounded-full ${
                              ZONE_COLOR_META[colorKey].swatch
                            } transition-transform ${
                              activeColor
                                ? 'ring-2 ring-offset-2 ring-slate-900 dark:ring-white dark:ring-offset-[#0F151D] scale-110'
                                : 'opacity-70 hover:opacity-100'
                            }`}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {selectedKind === 'building' && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                    Gebouwkleur
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      title="Standaard"
                      onClick={() => updateSelectedLocation({ zoneColor: undefined })}
                      className={`px-2.5 py-1 text-[11px] font-medium rounded-lg border transition-colors ${
                        !selectedLocation.zoneColor
                          ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                          : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090D12] text-slate-600 dark:text-slate-400 hover:border-slate-400'
                      }`}
                    >
                      Standaard
                    </button>
                    {(Object.keys(ZONE_COLOR_META) as ZoneColor[]).map((colorKey) => {
                      const activeColor = selectedLocation.zoneColor === colorKey;
                      return (
                        <button
                          key={colorKey}
                          type="button"
                          title={BUILDING_COLOR_META[colorKey].label}
                          aria-label={`Kleur ${BUILDING_COLOR_META[colorKey].label}`}
                          onClick={() => updateSelectedLocation({ zoneColor: colorKey })}
                          className={`w-6 h-6 rounded-full ${
                            ZONE_COLOR_META[colorKey].swatch
                          } transition-transform ${
                            activeColor
                              ? 'ring-2 ring-offset-2 ring-slate-900 dark:ring-white dark:ring-offset-[#0F151D] scale-110'
                              : 'opacity-75 hover:opacity-100'
                          }`}
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              {selectedKind === 'zone' && (
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#090D12] border border-slate-200 dark:border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      Vakken in dit gebied
                    </span>
                    <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                      {getLocationCells(selectedLocation, mapCols, mapRows).length} tegels
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Selecteer losse vakken op de kaart en voeg ze toe aan of verwijder ze uit dit POV-gebied.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setPlaceMode(placeMode === 'zone' ? null : 'zone');
                      setPaintTerrain(null);
                      setMovingLocId(null);
                      if (placeMode === 'zone') {
                        setSelectedTiles([]);
                        setTileDragMode(null);
                      }
                    }}
                    className={`w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-colors ${
                      placeMode === 'zone'
                        ? 'bg-sky-600 text-white'
                        : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    }`}
                  >
                    <Grid2X2 className="w-3.5 h-3.5" />
                    <span>
                      {placeMode === 'zone'
                        ? 'Selectie actief — kies vakken op de kaart'
                        : 'Vakken selecteren voor dit gebied'}
                    </span>
                  </button>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  {selectedKind === 'zone' ? 'Ligging / Sector' : 'Adres'}
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

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
                <h5 className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-2">
                  {isHouseLocation(selectedLocation)
                    ? `Inwonenden (${linkedPersons.length})`
                    : `Gekoppelde personen (${linkedPersons.length})`}
                </h5>
                {linkedPersons.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {isHouseLocation(selectedLocation)
                      ? 'Nog geen inwonenden gekoppeld aan dit huis.'
                      : 'Geen gekoppelde personen voor deze locatie.'}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {linkedPersons.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => onSelectPerson?.(p)}
                        className="w-full text-left p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-emerald-500/60 bg-slate-50 dark:bg-[#090D12] transition-colors space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-white">
                            <User className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            <span>{p.name}</span>
                          </span>
                          <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
                            {p.code}
                          </span>
                        </div>
                        {isHouseLocation(selectedLocation) && (
                          <div className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                            Eén van de inwonenden van {selectedLocation.code} — {selectedLocation.name}
                          </div>
                        )}
                        <div className="flex items-center justify-between gap-2 pt-0.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                          <span>Open persoonlijk document</span>
                          <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="pb-3 border-b border-slate-200 dark:border-slate-800">
                <div className="text-xs font-mono text-emerald-600 dark:text-emerald-400">
                  {selectedLocation.code} ·{' '}
                  {selectedKind === 'zone' ? 'Omcirkeld gebied (POV)' : 'Gebouw'} ·{' '}
                  {CATEGORY_META[selectedLocation.category]?.label ?? 'Locatie'}
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
                  {isHouseLocation(selectedLocation)
                    ? `Inwonenden (${linkedPersons.length})`
                    : `Gekoppelde personen (${linkedPersons.length})`}
                </h5>
                {linkedPersons.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {isHouseLocation(selectedLocation)
                      ? 'Geen geregistreerde inwonenden in dit huis.'
                      : 'Geen geregistreerde personen op deze plek.'}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {linkedPersons.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => onSelectPerson?.(p)}
                        className="w-full text-left p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-emerald-500/60 bg-slate-50 dark:bg-[#090D12] transition-colors space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-white">
                            <User className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            <span>{p.name}</span>
                          </span>
                          <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
                            {p.code}
                          </span>
                        </div>
                        {isHouseLocation(selectedLocation) && (
                          <div className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                            Eén van de inwonenden van {selectedLocation.code} — {selectedLocation.name}
                          </div>
                        )}
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {p.occupation || 'Inwoner'} · {p.fingerprintCode}
                        </div>
                        <div className="flex items-center justify-between gap-2 pt-0.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                          <span>Open persoonlijk document</span>
                          <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h5 className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-2">
                  Bewijsstukken op deze plek ({linkedEvidence.length})
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
