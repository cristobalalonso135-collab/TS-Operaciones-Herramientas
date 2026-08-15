export interface ClassificationLine {
  vertical: string;
  medio: string;
  region?: string;
  zona?: string;
}

const CORE_VERTICALS = new Set([
  'futbol emotion',
  'football emotion',
  'basketball emotion',
  'running emotion',
  'brandstorming',
]);

const GRASSROOTS_VERTICALS = new Set([
  'real federacion andaluza de futbol',
  'the pitch',
]);

const GRASSROOTS_MEDIOS = new Set([
  'equipaciones',
  'equipaciones feds',
  'equipaciones web b2b',
  'equipaciones web b2c',
]);

const B2B_MEDIOS = new Set([
  'academy',
  'b2b',
  'b2b clearance',
  'b2b reps',
]);

const PRO_CLUBS_CORE_MEDIOS = new Set([
  'equipaciones pro',
]);

export function normalizeText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u00a0/g, ' ')
    .trim()
    .toLowerCase();
}

export function normalizeCountry(value: unknown, zonaFallback?: unknown): string {
  const normalized = normalizeText(value).replace(/ñ/g, 'n');
  const zona = normalizeText(zonaFallback).replace(/ñ/g, 'n');
  const aliases: Record<string, string> = {
    es: 'espana',
    esp: 'espana',
    espana: 'espana',
    fr: 'francia',
    fra: 'francia',
    francia: 'francia',
    it: 'italia',
    ita: 'italia',
    italia: 'italia',
    pt: 'portugal',
    por: 'portugal',
    portugal: 'portugal',
    de: 'alemania',
    ale: 'alemania',
    alemania: 'alemania',
    otros: 'otros',
    'sin pais': 'sin pais',
  };

  if (aliases[normalized]) return aliases[normalized];
  if (aliases[zona]) return aliases[zona];
  if (zona.includes('francia')) return 'francia';
  if (zona.includes('italia')) return 'italia';
  if (zona.includes('portugal')) return 'portugal';
  return normalized;
}

export function deriveBusinessArea(line: Pick<ClassificationLine, 'vertical' | 'medio'>): string {
  const vertical = normalizeText(line.vertical);
  const medio = normalizeText(line.medio);

  if (GRASSROOTS_VERTICALS.has(vertical)) return 'Grassroots';
  if (!CORE_VERTICALS.has(vertical)) return 'Pro Clubs';
  if (GRASSROOTS_MEDIOS.has(medio)) return 'Grassroots';
  if (B2B_MEDIOS.has(medio)) return 'B2B';
  if (PRO_CLUBS_CORE_MEDIOS.has(medio)) return 'Pro Clubs';
  return 'Sin área';
}

export function findArea(line: Pick<ClassificationLine, 'vertical' | 'medio'>): string {
  return deriveBusinessArea(line);
}

export function findResponsable(area: string, line: Pick<ClassificationLine, 'region' | 'zona'>): string {
  const normalizedArea = normalizeText(area);
  const country = normalizeCountry(line.region, line.zona);
  const zona = normalizeText(line.zona);

  if (normalizedArea === 'pro clubs') return 'Pablo Domeque';

  if (normalizedArea === 'grassroots') {
    if (zona.includes('francia')) return 'Maxime';
    if (zona.includes('italia')) return 'Francesco Nunziato';
    if (
      zona === 'portugal' ||
      zona === 'norte' ||
      zona === 'levante' ||
      zona === 'centro-sur' ||
      zona === 'centro sur'
    ) return 'Santi Navarro';
    return 'Pendiente';
  }

  if (normalizedArea === 'b2b') {
    return country === 'francia' ? 'Maxime' : 'Santi Navarro';
  }

  return 'Pendiente';
}

export function findSubresponsable(area: string, line: Pick<ClassificationLine, 'vertical' | 'medio' | 'region' | 'zona'>): string {
  const normalizedArea = normalizeText(area);
  const vertical = normalizeText(line.vertical);
  const medio = normalizeText(line.medio);
  const zona = normalizeText(line.zona);
  const country = normalizeCountry(line.region, line.zona);

  if (normalizedArea === 'pro clubs') {
    if (vertical.includes('mallorca') || vertical.includes('deportivo')) return 'Arturo';
    if (vertical.includes('kings league') || vertical.includes('huesca') || vertical.includes('nastic')) return 'Carlos';
    if (vertical.includes('real zaragoza')) return 'Pablo';
    if (medio === 'equipaciones pro') return 'David';
    return 'Pablo';
  }

  if (normalizedArea === 'grassroots') {
    if (!zona) return 'Pendiente';
    if (zona.includes('francia')) return 'Maxime';
    if (vertical === 'the pitch') return 'Stefano';
    if (zona.includes('italia')) return 'Francesco Nunziato';
    if (zona === 'portugal' || zona === 'norte') return 'Juanjo';
    if (zona.includes('levante')) return 'Samu';
    if (zona.includes('centro-sur') || zona.includes('centro sur')) return 'Tornos';
  }

  if (normalizedArea === 'b2b') {
    return country === 'francia' ? 'Maxime' : 'Marta';
  }

  return 'Pendiente';
}

export function classifyLine(line: ClassificationLine): {
  area: string;
  responsable: string;
  subresponsable: string;
} {
  const area = findArea(line);
  return {
    area,
    responsable: findResponsable(area, line),
    subresponsable: findSubresponsable(area, line),
  };
}
