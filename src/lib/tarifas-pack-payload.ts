import {
  activeRef,
  formatEuro,
  formatPct,
  fueraPackPrice,
  lineAge,
  packTotals,
  rrpPrice,
  sellPrice,
  type PackLine,
  type TarifaChannel,
  type TarifaProduct,
} from '@/lib/tarifas-model';
import { labelProductName, labelProductType, type TarifasCopy, type TarifasLocale } from '@/lib/tarifas-i18n';

export type PackDeckFormat = 'xlsx' | 'pptx';

export interface PackDeckLine {
  index: number;
  brand: string;
  type: string;
  name: string;
  colour: string;
  adultRef: string;
  youthRef: string;
  ref: string;
  ageLabel: string;
  feeLabel: string;
  club: number | null;
  stamp: number;
  lineTotal: number | null;
  fuera: number | null;
  pvp: number | null;
  image: string | null;
}

export interface PackDeckLabels {
  kicker: string;
  season: string;
  vat: string;
  club: string;
  stamp: string;
  fuera: string;
  pvp: string;
  margin: string;
  total: string;
  pieces: string;
  adultRef: string;
  youthRef: string;
  product: string;
  name: string;
  colour: string;
  fee: string;
  listado: string;
  photo: string;
}

export interface PackDeck {
  title: string;
  season: string;
  channel: string;
  fileSlug: string;
  locale: string;
  labels: PackDeckLabels;
  lines: PackDeckLine[];
  totals: {
    pieces: number;
    club: number;
    stamp: number;
    sale: number;
    fuera: number;
    rrp: number;
    margin: number | null;
  };
}

function slugPart(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
}

export function packFileSlug(name: string, season: string, channel: string): string {
  return ['Pack', name, season, channel]
    .map(slugPart)
    .filter(Boolean)
    .join('_') || 'Pack';
}

export function moneyLabel(value: number | null | undefined, locale: string): string {
  return formatEuro(value, locale);
}

export function pctLabel(value: number | null | undefined, locale: string): string {
  return formatPct(value, locale);
}

export function buildPackDeck(input: {
  products: TarifaProduct[];
  lines: PackLine[];
  channel: TarifaChannel;
  name: string;
  season: string;
  copy: TarifasCopy;
  locale: TarifasLocale;
  localeTag: string;
}): PackDeck {
  const byId = new Map(input.products.map((item) => [item.id, item]));
  const lines: PackDeckLine[] = input.lines.flatMap((line, index) => {
    const item = byId.get(line.id);
    if (!item) return [];
    const age = lineAge(line);
    const club = sellPrice(item, input.channel, line.fee, age);
    const stamp = Number.isFinite(line.stamp) ? line.stamp : 0;
    return [{
      index: index + 1,
      brand: item.brand,
      type: labelProductType(input.locale, item.productType),
      name: labelProductName(input.locale, item.name),
      colour: item.colour,
      adultRef: item.adultRef,
      youthRef: item.youthRef || '',
      ref: activeRef(item, age) || '',
      ageLabel: age === 'youth' ? input.copy.youth : input.copy.adult,
      feeLabel: `Fee ${line.fee}`,
      club,
      stamp,
      lineTotal: club == null ? (stamp || null) : Math.round((club + stamp) * 100) / 100,
      fuera: fueraPackPrice(item, input.channel),
      pvp: rrpPrice(item, input.channel, age),
      image: item.image || null,
    }];
  });
  const totals = packTotals(input.products, input.lines, input.channel);
  const title = input.name.trim() || input.copy.pack;
  const season = input.season.trim();
  return {
    title,
    season,
    channel: input.channel.toUpperCase(),
    fileSlug: packFileSlug(title, season, input.channel.toUpperCase()),
    locale: input.localeTag,
    labels: {
      kicker: 'Teamsports · Tarifas',
      season: input.copy.fieldSeason,
      vat: input.copy.vatIncluded,
      club: input.copy.clubPrice,
      stamp: input.copy.stamping,
      fuera: input.copy.outsidePack,
      pvp: 'PVP',
      margin: input.copy.margin,
      total: input.copy.totalPack,
      pieces: input.copy.packPieces,
      adultRef: input.copy.colAdultRef,
      youthRef: input.copy.colYouthRef,
      product: input.copy.colProduct,
      name: input.copy.fieldName,
      colour: input.copy.fieldColour,
      fee: input.copy.colClubFee,
      listado: input.copy.packListado,
      photo: input.copy.packPhoto,
    },
    lines,
    totals,
  };
}
