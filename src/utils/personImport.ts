import type { MapLocation } from '../types.ts';

export interface ParsedPersonImportRow {
  lineNumber: number;
  name: string;
  alias: string;
  age: number;
  ageValid: boolean;
  locationCodeInput: string;
  normalizedLocationCode: string;
  matchedLocation: MapLocation | null;
  publicBio: string;
  policeNotes: string;
}

function normalizeCodeToken(code: string): string {
  const trimmed = code.trim().toUpperCase();
  const match = /^([A-Z]+)[\s\-_]*0*(\d+)$/.exec(trimmed);
  if (match) {
    return `${match[1]}-${Number(match[2])}`;
  }
  return trimmed;
}

export function normalizeHouseOrLocationCode(rawInput: string): string {
  const trimmed = rawInput.trim();
  if (!trimmed) return '';

  // Pure numeric input -> house code "H-<num>" (1..infinity)
  if (/^\d+$/.test(trimmed)) {
    return `H-${Number(trimmed)}`;
  }

  // "H1", "H-1", "h-01", "H 12" -> "H-<num>"
  const houseMatch = /^h[\s\-_]*0*(\d+)$/i.exec(trimmed);
  if (houseMatch) {
    return `H-${Number(houseMatch[1])}`;
  }

  // Other codes like "LOC-01", "K-2" -> uppercase trimmed
  const otherMatch = /^([a-zA-Z]+)[\s\-_]+(\d+)$/.exec(trimmed);
  if (otherMatch) {
    return `${otherMatch[1].toUpperCase()}-${otherMatch[2]}`;
  }

  return trimmed;
}

export function findLocationByImportCode(
  rawInput: string,
  locations: MapLocation[]
): { matchedLocation: MapLocation | null; normalizedCode: string } {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return { matchedLocation: null, normalizedCode: '' };
  }

  const normalizedCode = normalizeHouseOrLocationCode(trimmed);
  const rawUpper = trimmed.toUpperCase();
  const normalizedUpper = normalizedCode.toUpperCase();
  const canonicalInput = normalizeCodeToken(normalizedCode);

  const exactMatch = locations.find((loc) => {
    const locCode = (loc.code ?? '').trim().toUpperCase();
    return locCode === rawUpper || locCode === normalizedUpper;
  });
  if (exactMatch) {
    return { matchedLocation: exactMatch, normalizedCode };
  }

  const canonicalMatch = locations.find((loc) => {
    const locCode = (loc.code ?? '').trim();
    if (!locCode) return false;
    return normalizeCodeToken(locCode) === canonicalInput;
  });
  if (canonicalMatch) {
    return { matchedLocation: canonicalMatch, normalizedCode };
  }

  // If pure number was entered (e.g. "3"), also check LOC-03 / LOC-3 fallback
  if (/^\d+$/.test(trimmed)) {
    const num = Number(trimmed);
    const locFallback = locations.find(
      (loc) => normalizeCodeToken(loc.code ?? '') === `LOC-${num}`
    );
    if (locFallback) {
      return { matchedLocation: locFallback, normalizedCode };
    }
  }

  // Fallback by exact location name or address
  const lower = trimmed.toLowerCase();
  const textMatch = locations.find(
    (loc) =>
      (loc.name ?? '').trim().toLowerCase() === lower ||
      (loc.address ?? '').trim().toLowerCase() === lower
  );

  return { matchedLocation: textMatch ?? null, normalizedCode };
}

export function parsePersonImportText(
  rawText: string,
  locations: MapLocation[]
): ParsedPersonImportRow[] {
  const lines = rawText.split(/\r?\n/);
  const rows: ParsedPersonImportRow[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;

    const cols = line.split('\t').map((c) => c.trim());
    const name = cols[0] ?? '';
    if (!name) continue;

    // Support both:
    // 6-column format: Name \t [Alias (can be empty)] \t Age \t Code \t PublicBio \t PoliceNotes
    // 5-column shorthand (when Alias column itself was omitted): Name \t Age \t Code \t PublicBio \t PoliceNotes
    const looksLikeOmittedAlias =
      cols.length >= 2 &&
      cols.length <= 5 &&
      /^\d{1,3}$/.test(cols[1] ?? '') &&
      (cols.length === 5 || !/^\d{1,3}$/.test(cols[2] ?? ''));

    let alias = '';
    let ageRaw = '';
    let locationInput = '';
    let publicBio = '';
    let policeNotes = '';

    if (looksLikeOmittedAlias) {
      alias = '';
      ageRaw = cols[1] ?? '';
      locationInput = cols[2] ?? '';
      publicBio = cols[3] ?? '';
      policeNotes = cols[4] ?? '';
    } else {
      alias = cols[1] ?? '';
      ageRaw = cols[2] ?? '';
      locationInput = cols[3] ?? '';
      publicBio = cols[4] ?? '';
      policeNotes = cols.slice(5).join(' ').trim();
    }

    const parsedAge = Number.parseInt(ageRaw, 10);
    const ageValid = /^\d+$/.test(ageRaw) && Number.isFinite(parsedAge) && parsedAge > 0 && parsedAge <= 130;
    const age = ageValid ? parsedAge : 35;

    const { matchedLocation, normalizedCode } = findLocationByImportCode(
      locationInput,
      locations
    );

    rows.push({
      lineNumber: i + 1,
      name,
      alias,
      age,
      ageValid,
      locationCodeInput: locationInput,
      normalizedLocationCode: normalizedCode,
      matchedLocation,
      publicBio,
      policeNotes,
    });
  }

  return rows;
}
