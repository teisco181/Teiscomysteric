import type { MapLocation, Person } from '../types.ts';

export interface ParsedPersonImportRow {
  lineNumber: number;
  name: string;
  alias: string;
  occupation: string;
  workLocationCodeInput: string;
  normalizedWorkLocationCode: string;
  matchedWorkLocation: MapLocation | null;
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

export function normalizeHouseOrLocationCode(
  rawInput: string,
  defaultPureNumberPrefix: 'H' | 'LOC' = 'H'
): string {
  const trimmed = rawInput.trim();
  if (!trimmed) return '';

  // Pure numeric input -> "H-<num>" (default for residence) or "LOC-<num>"
  if (/^\d+$/.test(trimmed)) {
    return `${defaultPureNumberPrefix}-${Number(trimmed)}`;
  }

  // "H1", "H-1", "h-01", "H 12" -> "H-<num>"
  const houseMatch = /^h[\s\-_]*0*(\d+)$/i.exec(trimmed);
  if (houseMatch) {
    return `H-${Number(houseMatch[1])}`;
  }

  // Other codes like "LOC-01", "W1", "B-2", "K 03" -> "<PREFIX>-<num>"
  const otherMatch = /^([a-zA-Z]+)[\s\-_]*0*(\d+)$/.exec(trimmed);
  if (otherMatch) {
    return `${otherMatch[1].toUpperCase()}-${Number(otherMatch[2])}`;
  }

  return trimmed.toUpperCase();
}

export function findLocationByImportCode(
  rawInput: string,
  locations: MapLocation[],
  defaultPureNumberPrefix: 'H' | 'LOC' = 'H'
): { matchedLocation: MapLocation | null; normalizedCode: string } {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return { matchedLocation: null, normalizedCode: '' };
  }

  const normalizedCode = normalizeHouseOrLocationCode(
    trimmed,
    defaultPureNumberPrefix
  );
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

  // If pure number was entered (e.g. "3"), also check LOC-03 / H-3 fallback
  if (/^\d+$/.test(trimmed)) {
    const num = Number(trimmed);
    const altPrefix = defaultPureNumberPrefix === 'H' ? 'LOC' : 'H';
    const altFallback = locations.find(
      (loc) => normalizeCodeToken(loc.code ?? '') === `${altPrefix}-${num}`
    );
    if (altFallback) {
      return { matchedLocation: altFallback, normalizedCode };
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

function looksLikeLocationCodeToken(rawInner: string): boolean {
  const inner = rawInner.trim();
  if (!inner) return false;
  return /^(?:[a-zA-Z]{1,8}[\s\-_]*\d+|\d+)$/.test(inner);
}

export function extractOccupationAndWorkCode(
  rawOccupation: string,
  locations: MapLocation[]
): {
  occupation: string;
  workLocationCodeInput: string;
  normalizedWorkLocationCode: string;
  matchedWorkLocation: MapLocation | null;
} {
  const trimmed = rawOccupation.trim();
  if (!trimmed) {
    return {
      occupation: '',
      workLocationCodeInput: '',
      normalizedWorkLocationCode: '',
      matchedWorkLocation: null,
    };
  }

  const matches = Array.from(trimmed.matchAll(/\(([^()]+)\)/g));
  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i];
    const inner = (match[1] ?? '').trim();
    if (!inner) continue;

    const lookup = findLocationByImportCode(inner, locations, 'LOC');
    if (lookup.matchedLocation || looksLikeLocationCodeToken(inner)) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      const cleanedOccupation = (trimmed.slice(0, start) + ' ' + trimmed.slice(end))
        .replace(/\s+/g, ' ')
        .trim();

      return {
        occupation: cleanedOccupation,
        workLocationCodeInput: inner,
        normalizedWorkLocationCode: lookup.normalizedCode,
        matchedWorkLocation: lookup.matchedLocation,
      };
    }
  }

  return {
    occupation: trimmed,
    workLocationCodeInput: '',
    normalizedWorkLocationCode: '',
    matchedWorkLocation: null,
  };
}

export function resolvePersonHomeLocation(
  person: Person,
  locations: MapLocation[]
): MapLocation | null {
  if (person.locationId) {
    const byId = locations.find((l) => l.id === person.locationId);
    if (byId) return byId;
  }
  if (!person.locationId && person.address) {
    return findLocationByImportCode(person.address, locations, 'H').matchedLocation;
  }
  return null;
}

export function resolvePersonWorkLocation(
  person: Person,
  locations: MapLocation[]
): MapLocation | null {
  if (person.workLocationId) {
    const byId = locations.find((l) => l.id === person.workLocationId);
    if (byId) return byId;
  }
  if (person.workLocationCode) {
    return findLocationByImportCode(person.workLocationCode, locations, 'LOC')
      .matchedLocation;
  }
  return null;
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

    // 7-column format:
    // Name \t [Alias (can be empty)] \t Occupation[(WorkCode)] \t Age \t Code \t PublicBio \t PoliceNotes
    // 6-column shorthand (when Alias column itself was omitted):
    // Name \t Occupation[(WorkCode)] \t Age \t Code \t PublicBio \t PoliceNotes
    const looksLikeOmittedAlias =
      cols.length >= 3 &&
      cols.length <= 6 &&
      Boolean(cols[1]) &&
      !/^\d+$/.test(cols[1] ?? '') &&
      /^\d{1,3}$/.test(cols[2] ?? '');

    let alias = '';
    let rawOccupation = '';
    let ageRaw = '';
    let locationInput = '';
    let publicBio = '';
    let policeNotes = '';

    if (looksLikeOmittedAlias) {
      alias = '';
      rawOccupation = cols[1] ?? '';
      ageRaw = cols[2] ?? '';
      locationInput = cols[3] ?? '';
      publicBio = cols[4] ?? '';
      policeNotes = cols[5] ?? '';
    } else {
      alias = cols[1] ?? '';
      rawOccupation = cols[2] ?? '';
      ageRaw = cols[3] ?? '';
      locationInput = cols[4] ?? '';
      publicBio = cols[5] ?? '';
      policeNotes = cols.slice(6).join(' ').trim();
    }

    const {
      occupation,
      workLocationCodeInput,
      normalizedWorkLocationCode,
      matchedWorkLocation,
    } = extractOccupationAndWorkCode(rawOccupation, locations);

    const parsedAge = Number.parseInt(ageRaw, 10);
    const ageValid =
      /^\d+$/.test(ageRaw) &&
      Number.isFinite(parsedAge) &&
      parsedAge > 0 &&
      parsedAge <= 130;
    const age = ageValid ? parsedAge : 35;

    const { matchedLocation, normalizedCode } = findLocationByImportCode(
      locationInput,
      locations,
      'H'
    );

    rows.push({
      lineNumber: i + 1,
      name,
      alias,
      occupation,
      workLocationCodeInput,
      normalizedWorkLocationCode,
      matchedWorkLocation,
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

export function buildPersonImportAiPrompt(locations: MapLocation[]): string {
  const houses = locations.filter(
    (l) => l.category === 'house' || /^h[-\s]?\d+/i.test((l.code ?? '').trim())
  );
  const workBuildings = locations.filter(
    (l) => l.category !== 'house' && !/^h[-\s]?\d+/i.test((l.code ?? '').trim())
  );

  const houseList =
    houses.length > 0
      ? houses.map((l) => `${l.code} (${l.name})`).join(', ')
      : 'H-1, H-2, H-3, ... (H- gevolgd door het huisnummer)';

  const workList =
    workBuildings.length > 0
      ? workBuildings.map((l) => `${l.code} (${l.name})`).join(', ')
      : 'bijv. W-1 (Bakkerij), LOC-01 (Havenkantoor), B-2 (Bibliotheek)';

  return [
    'Genereer personages voor het Teiscomysterics importvenster als pure Tab-gescheiden tekst (TSV).',
    '',
    'STRIKTE REGELS (LEES ZORGVULDIG OM FOUTEN TE VOORKOMEN):',
    '1. Geef ALLEEN de gegevens in één platte tekst- of TSV-codeblok. GEEN kopregel (header), GEEN uitleg in het codeblok en GEEN Markdown-tabel met | tekens.',
    '2. Elke nieuwe persoon staat op precies 1 eigen regel (gescheiden door Enter). Gebruik NOOIT een Enter binnen een omschrijving of aantekening.',
    '3. Elke regel heeft EXACT 7 kolommen, gescheiden door een echte Tab (\\t) — dus exact 6 Tabs per regel. Gebruik GEEN komma of puntkomma als scheidingsteken.',
    '4. Kolomvolgorde per regel:',
    '   Kolom 1: Volledige naam (verplicht)',
    '   Kolom 2: Bijnaam (mag leeg blijven! Laat dan tussen Tab 1 en Tab 2 helemaal niets staan: Naam\\t\\tBeroep...)',
    '   Kolom 3: Beroep + werkgebouwcode tussen haakjes als de persoon ergens werkt (bijv. Bakker (W-1) of Havenmeester (LOC-01)). De importer verwijdert de haakjes automatisch en koppelt werknemer en gebouw aan elkaar. Werkt iemand nergens op de kaart, laat de haakjes dan weg.',
    '   Kolom 4: Leeftijd (alleen een geheel getal, bijv. 42 — zet er geen woord zoals "jaar" achter)',
    '   Kolom 5: Woonlocatiecode op de kaart (voor huizen ALTIJD H- gevolgd door het nummer, bijv. H-1, H-2, H-15; laat leeg als onbekend, maar behoud wel de Tab)',
    '   Kolom 6: Openbare achtergrond voor spelers (1 doorlopende tekst zonder Enter of Tab)',
    '   Kolom 7: Politie-aantekeningen voor spelers (1 doorlopende tekst zonder Enter of Tab)',
    '',
    `Beschikbare huiscodes (woonadres, kolom 5): ${houseList}`,
    `Beschikbare gebouwcodes (werkplek tussen haakjes in kolom 3): ${workList}`,
    '',
    'EXACT VOORBEELD VAN GELDIGE OUTPUT (kopieer deze structuur):',
    'Jan de Vries\t\tBakker (W-1)\t42\tH-1\tBakker op de hoek van het plein.\tGezien rond 22:00 bij de haven.',
    'Sanne Bakker\tDe Vos\tBibliothecaresse (LOC-02)\t29\tH-2\tBuurvrouw naast de bakkerij.\tHoorde voetstappen in de steeg.',
  ].join('\n');
}
