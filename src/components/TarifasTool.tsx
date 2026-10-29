'use client';

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import FileUpload from '@/components/FileUpload';
import WorkspaceChrome from '@/components/WorkspaceChrome';
import catalog from '@/data/tarifas-catalog.json';
import {
  b2bExportRows,
  b2cExportRows,
  mergeKeptPrices,
  moneyFromInput,
  outletExportRows,
  outletQuoteExportRows,
  overlayChannelPrices,
  parseTarifasWorkbook,
  productExportRows,
  type IngestZone,
} from '@/lib/tarifas-excel';
import {
  GENDERS,
  KINDS,
  NOVELTIES,
  SPORTS,
  activeRef,
  ageKind,
  asOutletProduct,
  asProduct,
  channelFees,
  colourways,
  emptyProduct,
  formatEuro,
  formatPct,
  formatRed,
  fueraPackPrice,
  hasAdult,
  hasYouth,
  isExpired,
  kindOf,
  emptyOutletLine,
  lineAge,
  lineMargin,
  marginPct,
  newId,
  outletBounds,
  outletCost,
  outletTotals,
  packAgeOf,
  packTotals,
  priceInputOf,
  redYear,
  rrpPrice,
  sellPrice,
  uniqueSorted,
  type FeeLevel,
  type OutletLine,
  type PackLine,
  type TarifaAge,
  type TarifaAgeKind,
  type TarifaChannel,
  type TarifaGender,
  type TarifaKind,
  type TarifaNovelty,
  type TarifaProduct,
  type TarifaSport,
} from '@/lib/tarifas-model';
import { loadTarifasCatalog, saveTarifasCatalog, type TarifasBackend } from '@/lib/tarifas-store';
import { emptyReservasCatalog, type ReservasCatalog } from '@/lib/reservas-model';
import { loadReservasCatalog, saveReservasCatalog, type ReservasBackend } from '@/lib/reservas-store';
import ReservasPanel from '@/components/ReservasPanel';
import ReservasMaestro from '@/components/ReservasMaestro';
import { PhotoLightbox, TarifasPhoto } from '@/components/TarifasPhoto';
import { buildPackDeck, type PackDeckFormat } from '@/lib/tarifas-pack-payload';
import {
  TARIFAS_COPY,
  TARIFAS_LOCALES,
  TARIFAS_LOCALE_TAG,
  labelProductType,
  readTarifasLocale,
  writeTarifasLocale,
  type TarifasCopy,
  type TarifasLocale,
} from '@/lib/tarifas-i18n';
import { ArrowLeft, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Columns2, Copy, Download, FileSpreadsheet, Info, LayoutGrid, Lock, LogOut, Plus, Presentation, Search, ShoppingBag, Table2, Trash2, X } from 'lucide-react';

const ADMIN_KEY = '2627';
const ADMIN_STORAGE = 'ts-tarifas-admin';
const COMPARE_MAX = 4;

type TarifasTab = 'catalogo' | 'pack' | 'reservas' | 'maestro';
type TarifasEntry = 'b2c' | 'b2b' | 'outlet';

type PackDraft = {
  id: string;
  name: string;
  season: string;
  lines: PackLine[];
};

function emptyPackDraft(season = '26/27'): PackDraft {
  return { id: newId('pack'), name: '', season, lines: [] };
}

function packDraftLabel(pack: PackDraft, fallback: string, index: number) {
  return pack.name.trim() || `${fallback} ${index + 1}`;
}

const SEED = (catalog as unknown[]).map(asProduct);

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-9 rounded-full border px-3 text-xs font-semibold ${
        active ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white text-neutral-600'
      }`}
    >
      {children}
    </button>
  );
}

function toggleItem<T extends string>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function picked(list: string[], value: string) {
  return list.length === 0 || list.includes(value);
}

function keepSelected(list: string[], selected: string[]) {
  const missing = selected.filter((item) => !list.includes(item));
  return missing.length ? [...missing, ...list] : list;
}

function yearOf(item: TarifaProduct) {
  return redYear(item.red) || 'none';
}

function rankTone(nums: Array<number | null | undefined>, index: number): 'low' | 'high' | null {
  const valid = nums.filter((value): value is number => value != null && Number.isFinite(value));
  if (valid.length < 2) return null;
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  if (min === max) return null;
  const value = nums[index];
  if (value == null || !Number.isFinite(value)) return null;
  if (value === min) return 'low';
  if (value === max) return 'high';
  return null;
}

function RankBadge({ tone, copy }: { tone: 'low' | 'high' | null; copy: TarifasCopy }) {
  if (!tone) return null;
  return (
    <span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${
      tone === 'low' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'
    }`}>
      {tone === 'low' ? copy.cheapest : copy.dearest}
    </span>
  );
}

function toneClass(tone: 'low' | 'high' | null | undefined, differs = false) {
  if (tone === 'low') return 'bg-emerald-50 font-semibold text-emerald-950';
  if (tone === 'high') return 'bg-rose-50 font-semibold text-rose-950';
  if (differs) return 'bg-amber-50 font-semibold';
  return '';
}

function useCompact(query = '(max-width: 767px)') {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(query);
    const apply = () => setCompact(media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [query]);
  return compact;
}

function CompareSheet({
  count,
  heads,
  rows,
}: {
  count: number;
  heads: ReactNode[];
  rows: { section?: string; label: string; values: ReactNode[]; tones?: Array<'low' | 'high' | null>; differs?: boolean }[];
}) {
  return (
    <div className="-mx-1 overflow-x-auto overscroll-x-contain">
      <div
        className="grid"
        style={{
          gridTemplateColumns: `minmax(4.5rem, 5.5rem) repeat(${count}, minmax(9.5rem, 1fr))`,
          minWidth: `${4.75 + count * 10}rem`,
        }}
      >
        <div className="sticky left-0 z-[1] bg-white px-3 py-4" />
        {heads.map((head, index) => (
          <div key={index} className="min-w-0 px-2 py-4">{head}</div>
        ))}
        {rows.map((row) => (
          <Fragment key={`${row.section || ''}-${row.label}`}>
            {row.section ? (
              <div className="col-span-full bg-neutral-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
                {row.section}
              </div>
            ) : null}
            <div className="sticky left-0 z-[1] border-t border-neutral-100 bg-white px-2 py-2 text-[10px] uppercase tracking-[0.12em] text-neutral-400 sm:px-3 sm:text-[11px]">{row.label}</div>
            {row.values.map((value, index) => (
              <div
                key={`${row.label}-${index}`}
                className={`min-w-0 border-t border-neutral-100 px-2 py-2 text-sm whitespace-pre-line ${toneClass(row.tones?.[index], row.differs)}`}
              >
                {value}
              </div>
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function marginTone(margin: number | null) {
  if (margin == null) return 'text-neutral-400';
  if (margin < 0) return 'text-rose-700';
  if (margin < 12) return 'text-amber-800';
  return 'text-emerald-800';
}

function OutletPriceControl({
  item,
  line,
  copy,
  euro,
  pct,
  onChange,
}: {
  item: TarifaProduct;
  line: OutletLine;
  copy: TarifasCopy;
  euro: (value: number | null | undefined) => string;
  pct: (value: number | null | undefined) => string;
  onChange: (next: OutletLine) => void;
}) {
  const age = lineAge(line);
  const cost = outletCost(item, age);
  const bounds = outletBounds(item, age);
  const price = Number.isFinite(line.price) ? line.price : 0;
  const margin = marginPct(price, cost);
  const setPrice = (value: number, input?: string) => {
    const next = Math.round(Math.max(0, value) * 100) / 100;
    onChange({ ...line, age, price: next, priceInput: input ?? priceInputOf(next) });
  };
  return (
    <div className="space-y-2" onClick={(event) => event.stopPropagation()}>
      {hasAdult(item) && hasYouth(item) ? (
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => onChange(emptyOutletLine(item, 'adult'))}
            className={`min-h-8 rounded-full px-2.5 py-1 text-[11px] font-semibold ${age === 'adult' ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600'}`}
          >
            {copy.adult}
          </button>
          <button
            type="button"
            onClick={() => onChange(emptyOutletLine(item, 'youth'))}
            className={`min-h-8 rounded-full px-2.5 py-1 text-[11px] font-semibold ${age === 'youth' ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600'}`}
          >
            {copy.youth}
          </button>
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="text-neutral-400">{copy.cost} {cost == null ? copy.noCost : euro(cost)}</span>
        <span className={`font-semibold tabular-nums ${marginTone(margin)}`}>{copy.margin} {pct(margin)}</span>
      </div>
      <input
        type="range"
        min={bounds.min}
        max={Math.max(bounds.max, price, 1)}
        step={0.25}
        value={Math.min(Math.max(bounds.max, price, 1), Math.max(bounds.min, price))}
        onChange={(event) => setPrice(Number(event.target.value))}
        className="h-2 w-full cursor-pointer accent-neutral-900"
        aria-label={copy.outletPriceAria}
      />
      <div className="flex items-center gap-2">
        <input
          inputMode="decimal"
          value={line.priceInput}
          onChange={(event) => {
            const raw = event.target.value;
            setPrice(moneyFromInput(raw) ?? 0, raw);
          }}
          className="h-9 w-[5.75rem] rounded-lg border border-neutral-200 px-2 text-right text-sm tabular-nums outline-none"
          aria-label={copy.outletPriceAria}
        />
        <p className="min-w-0 font-display text-lg font-semibold tabular-nums">
          {euro(price)}
          <span className="ml-1 text-[10px] font-medium text-neutral-400">{copy.vatIncluded}</span>
        </p>
      </div>
    </div>
  );
}

function AgeFeePicker({
  item,
  age,
  fee,
  fees,
  copy,
  onAge,
  onFee,
}: {
  item: TarifaProduct;
  age: TarifaAge;
  fee: FeeLevel;
  fees: FeeLevel[];
  copy: TarifasCopy;
  onAge: (age: TarifaAge) => void;
  onFee: (fee: FeeLevel) => void;
}) {
  return (
    <div className="space-y-1.5">
      {hasAdult(item) || hasYouth(item) ? (
        <div className="flex flex-wrap gap-1">
          {hasAdult(item) ? (
            <button
              type="button"
              onClick={() => onAge('adult')}
              className={`min-h-8 rounded-full px-2.5 py-1 text-[11px] font-semibold ${age === 'adult' ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600'}`}
            >
              {copy.adult}
            </button>
          ) : null}
          {hasYouth(item) ? (
            <button
              type="button"
              onClick={() => onAge('youth')}
              className={`min-h-8 rounded-full px-2.5 py-1 text-[11px] font-semibold ${age === 'youth' ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600'}`}
            >
              {copy.youth}
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-1">
        {fees.map((level) => (
          <button
            key={level}
            type="button"
            onClick={() => onFee(level)}
            className={`min-h-8 min-w-8 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              fee === level ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600'
            }`}
          >
            {level}
          </button>
        ))}
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  options,
  selected,
  onToggle,
  onClear,
  onSet,
  copy,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
  onSet: (values: string[]) => void;
  copy: TarifasCopy;
}) {
  const [open, setOpen] = useState(false);
  const [needle, setNeedle] = useState('');
  const [mounted, setMounted] = useState(false);
  const compact = useCompact();
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchable = options.length > 4;
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (event: MouseEvent) => {
      const target = event.target as Node;
      if (root.current?.contains(target) || panel.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  useEffect(() => {
    if (!open || !compact) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, compact]);
  useEffect(() => {
    if (!open) {
      setNeedle('');
      return;
    }
    if (searchable) searchRef.current?.focus();
  }, [open, searchable]);
  const q = needle.trim().toLocaleLowerCase('es');
  const visible = q
    ? options.filter((item) => item.label.toLocaleLowerCase('es').includes(q))
    : options;
  const allVisibleOn = visible.length > 0 && visible.every((item) => selected.includes(item.value));
  const toggleVisible = () => {
    if (allVisibleOn) {
      const drop = new Set(visible.map((item) => item.value));
      onSet(selected.filter((value) => !drop.has(value)));
      return;
    }
    const have = new Set(selected);
    onSet([...selected, ...visible.map((item) => item.value).filter((value) => !have.has(value))]);
  };
  const menu = open ? (
    <div
      ref={panel}
      className={compact
        ? 'fixed inset-x-0 bottom-0 z-[71] flex max-h-[80vh] flex-col overflow-hidden rounded-t-3xl bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-16px_40px_rgba(15,15,15,0.12)]'
        : 'absolute left-0 top-full z-20 mt-1.5 w-64 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-[0_16px_40px_rgba(15,15,15,0.08)]'}
    >
      {compact ? (
        <div className="flex items-center justify-between px-4 pb-1 pt-3">
          <p className="text-sm font-semibold">{label}</p>
          <button type="button" onClick={() => setOpen(false)} className="rounded-md p-1 text-neutral-400" aria-label={copy.close}>
            <X className="h-5 w-5" />
          </button>
        </div>
      ) : null}
      {searchable ? (
        <div className="border-b border-neutral-100 p-2">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
            <input
              ref={searchRef}
              value={needle}
              onChange={(event) => setNeedle(event.target.value)}
              placeholder={copy.filterSearch}
              className="h-11 w-full rounded-xl bg-neutral-50 pl-8 pr-3 text-neutral-800 outline-none placeholder:text-neutral-400 sm:h-9"
            />
          </label>
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-3 px-3 py-2">
        <button
          type="button"
          onClick={toggleVisible}
          disabled={visible.length === 0}
          className="text-xs font-semibold text-neutral-500 hover:text-neutral-900 disabled:opacity-40"
        >
          {allVisibleOn ? copy.clearSelection : copy.selectAll}
        </button>
        {selected.length > 0 && !allVisibleOn ? (
          <button type="button" onClick={onClear} className="text-xs text-neutral-400 hover:text-neutral-700">
            {copy.clearSelection}
          </button>
        ) : null}
      </div>
      <div className={`overflow-auto pb-1 ${compact ? 'max-h-[min(24rem,55vh)]' : 'max-h-64'}`}>
        {visible.map((item) => {
          const on = selected.includes(item.value);
          return (
            <button
              key={item.value}
              type="button"
              onClick={() => onToggle(item.value)}
              className={`flex w-full items-center gap-2.5 px-3 text-left text-sm hover:bg-neutral-50 ${compact ? 'min-h-12 py-3' : 'py-2'} ${on ? 'text-neutral-900' : 'text-neutral-600'}`}
            >
              <span className={`inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md border ${on ? 'border-neutral-900 bg-neutral-900' : 'border-neutral-300 bg-white'}`}>
                {on ? <Check className="h-3 w-3 text-white" strokeWidth={3} /> : null}
              </span>
              <span className="min-w-0 flex-1 leading-snug">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  ) : null;
  return (
    <div ref={root} className={`relative shrink-0 ${open ? 'z-30' : ''}`}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`inline-flex h-10 items-center gap-1.5 rounded-full border bg-white pl-3 pr-2 text-sm transition-colors ${
          selected.length || open
            ? 'border-neutral-900 text-neutral-900'
            : 'border-neutral-200 text-neutral-600 hover:border-neutral-300'
        }`}
      >
        <span className="whitespace-nowrap">{label}</span>
        {selected.length > 0 ? (
          <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-neutral-900 px-1.5 text-[10px] font-semibold tabular-nums text-white">
            {selected.length}
          </span>
        ) : null}
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-neutral-400 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && !compact ? menu : null}
      {open && compact && mounted
        ? createPortal(
          <>
            <button type="button" className="fixed inset-0 z-[70] bg-neutral-900/40" aria-label={copy.close} onClick={() => setOpen(false)} />
            {menu}
          </>,
          document.body,
        )
        : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-400">{label}</span>
      {children}
    </label>
  );
}

function IngestCard({
  kicker,
  hint,
  inputId,
  label,
  onWorkbook,
  downloadLabel,
  onDownload,
  extra,
}: {
  kicker: string;
  hint: string;
  inputId: string;
  label: string;
  onWorkbook: (sheets: Record<string, unknown[][]>) => void;
  downloadLabel: string;
  onDownload: () => void;
  extra?: ReactNode;
}) {
  return (
    <div className="space-y-3 rounded-2xl border border-neutral-200 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">{kicker}</p>
      <p className="text-sm text-neutral-500">{hint}</p>
      <FileUpload
        label={label}
        inputId={inputId}
        compact
        onFileLoaded={() => undefined}
        onWorkbookLoaded={(sheets) => onWorkbook(sheets)}
      />
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onDownload} className="inline-flex h-10 items-center gap-2 rounded-full border border-neutral-200 px-4 text-xs font-semibold">
          <Download className="h-4 w-4" /> {downloadLabel}
        </button>
        {extra}
      </div>
    </div>
  );
}

const inputClass = 'h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm outline-none';

function Flag({ code }: { code: TarifasLocale }) {
  if (code === 'es') {
    return (
      <span className="flex h-[18px] w-[26px] flex-col overflow-hidden rounded-[4px] shadow-sm ring-1 ring-black/10">
        <span className="h-[26%] bg-[#c60b1e]" />
        <span className="h-[48%] bg-[#ffc400]" />
        <span className="h-[26%] bg-[#c60b1e]" />
      </span>
    );
  }
  if (code === 'pt') {
    return (
      <span className="flex h-[18px] w-[26px] overflow-hidden rounded-[4px] shadow-sm ring-1 ring-black/10">
        <span className="w-[40%] bg-[#006600]" />
        <span className="w-[60%] bg-[#ff0000]" />
      </span>
    );
  }
  if (code === 'it') {
    return (
      <span className="flex h-[18px] w-[26px] overflow-hidden rounded-[4px] shadow-sm ring-1 ring-black/10">
        <span className="w-1/3 bg-[#009246]" />
        <span className="w-1/3 bg-white" />
        <span className="w-1/3 bg-[#ce2b37]" />
      </span>
    );
  }
  return (
    <span className="flex h-[18px] w-[26px] overflow-hidden rounded-[4px] shadow-sm ring-1 ring-black/10">
      <span className="w-1/3 bg-[#002654]" />
      <span className="w-1/3 bg-white" />
      <span className="w-1/3 bg-[#ed2939]" />
    </span>
  );
}

function LangSwitch({
  locale,
  onChange,
  copy,
}: {
  locale: TarifasLocale;
  onChange: (next: TarifasLocale) => void;
  copy: TarifasCopy;
}) {
  const names: Record<TarifasLocale, string> = {
    es: copy.langEs,
    pt: copy.langPt,
    it: copy.langIt,
    fr: copy.langFr,
  };
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white px-2 py-1.5 sm:px-3 sm:py-2">
      <p className="mb-1.5 hidden text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-400 sm:block">{copy.selectLanguage}</p>
      <div className="flex items-center gap-0.5">
        {TARIFAS_LOCALES.map((code) => (
          <button
            key={code}
            type="button"
            onClick={() => onChange(code)}
            title={names[code]}
            className={`flex items-center gap-1.5 rounded-full px-2 py-1 ${
              locale === code ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-50'
            }`}
          >
            <Flag code={code} />
            {locale === code ? <span className="text-[11px] font-semibold">{names[code]}</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

function AgeChip({ tone, children }: { tone: 'adult' | 'youth'; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
        tone === 'adult' ? 'bg-indigo-600 text-white' : 'bg-teal-600 text-white'
      }`}
    >
      {children}
    </span>
  );
}

function PvpLines({
  item,
  channel,
  mode,
  copy,
  localeTag,
}: {
  item: TarifaProduct;
  channel: TarifaChannel;
  mode: TarifaAgeKind[];
  copy: TarifasCopy;
  localeTag: string;
}) {
  const adult = rrpPrice(item, channel, 'adult');
  const youth = rrpPrice(item, channel, 'youth');
  const showAdult = mode.length === 0 || mode.some((item) => item !== 'youthOnly');
  const showYouth = hasYouth(item) && (mode.length === 0 || mode.some((item) => item !== 'adult'));
  if (!showYouth) {
    return <p className="text-[11px] tabular-nums text-neutral-400">PVP {formatEuro(adult, localeTag)}</p>;
  }
  if (!showAdult) {
    return <p className="text-[11px] tabular-nums text-neutral-400">PVP {copy.youthPvp} {formatEuro(youth, localeTag)}</p>;
  }
  return (
    <p className="text-[11px] tabular-nums text-neutral-400">
      PVP {formatEuro(adult, localeTag)}
      <span className="text-neutral-300"> · </span>
      {copy.youthPvp} {formatEuro(youth, localeTag)}
    </p>
  );
}

function compareRows(
  items: TarifaProduct[],
  channel: TarifaChannel,
  fees: FeeLevel[],
  copy: TarifasCopy,
  euro: (value: number | null | undefined) => string,
  asOutlet = false,
): { section?: string; label: string; values: string[]; nums?: Array<number | null> }[] {
  const ageLabel = (item: TarifaProduct) => (
    ageKind(item) === 'both' ? copy.adultAndYouth : ageKind(item) === 'youthOnly' ? copy.youthOnly : copy.adultOnly
  );
  const adultPvp = items.map((item) => rrpPrice(item, channel, 'adult'));
  const youthPvp = items.map((item) => (hasYouth(item) ? rrpPrice(item, channel, 'youth') : null));
  const costs = items.map((item) => outletCost(item, ageKind(item) === 'youthOnly' ? 'youth' : 'adult'));
  const priceRows = asOutlet
    ? [
      { section: copy.comparePrices, label: copy.cost, values: costs.map(euro), nums: costs },
      { label: `PVP ${copy.adult}`, values: adultPvp.map(euro), nums: adultPvp },
      {
        label: `PVP ${copy.youth}`,
        values: youthPvp.map((value, index) => (hasYouth(items[index]) ? euro(value) : '—')),
        nums: youthPvp,
      },
    ]
    : [
      { section: copy.comparePrices, label: `PVP ${copy.adult}`, values: adultPvp.map(euro), nums: adultPvp },
      {
        label: `PVP ${copy.youth}`,
        values: youthPvp.map((value, index) => (hasYouth(items[index]) ? euro(value) : '—')),
        nums: youthPvp,
      },
      ...fees.map((level) => {
        const nums = items.map((item) => sellPrice(item, channel, level, 'adult'));
        return { label: `Fee ${level}`, values: nums.map(euro), nums };
      }),
    ];
  return [
    {
      section: copy.lifecycle,
      label: copy.fieldNovelty,
      values: items.map((item) => (item.novelty ? copy.novelties[item.novelty] : copy.fieldNone)),
    },
    { label: copy.fieldSeason, values: items.map((item) => item.season || '—') },
    { label: copy.fieldCollection, values: items.map((item) => item.collection || '—') },
    {
      label: copy.validity,
      values: items.map((item) => (item.red ? `${formatRed(item.red)}${isExpired(item.red) ? ` · ${copy.expired}` : ''}` : '—')),
    },
    ...priceRows,
    { section: copy.fieldKind, label: copy.fieldKind, values: items.map((item) => copy.kinds[kindOf(item)]) },
    { label: copy.sport, values: items.map((item) => copy.sports[item.sport as TarifaSport] || item.sport) },
    { label: copy.gender, values: items.map((item) => copy.genders[item.gender]) },
    { label: copy.adultAndYouth, values: items.map(ageLabel) },
    { label: copy.colAdultRef, values: items.map((item) => item.adultRef || '—') },
    { label: copy.colYouthRef, values: items.map((item) => item.youthRef || '—') },
  ];
}

function packCompareRows(
  packs: PackDraft[],
  products: TarifaProduct[],
  channel: TarifaChannel,
  copy: TarifasCopy,
  locale: TarifasLocale,
  euro: (value: number | null | undefined) => string,
  pct: (value: number | null | undefined) => string,
): { section?: string; label: string; values: string[] }[] {
  const byId = new Map(products.map((item) => [item.id, item]));
  const totals = packs.map((pack) => packTotals(products, pack.lines, channel));
  const types: string[] = [];
  packs.forEach((pack) => {
    pack.lines.forEach((line) => {
      const type = byId.get(line.id)?.productType;
      if (type && !types.includes(type)) types.push(type);
    });
  });
  const composition = types.map((type, index) => ({
    section: index === 0 ? copy.packComposition : undefined,
    label: labelProductType(locale, type),
    values: packs.map((pack) => {
      const lines = pack.lines.filter((line) => byId.get(line.id)?.productType === type);
      if (!lines.length) return '—';
      return lines.map((line) => {
        const item = byId.get(line.id);
        if (!item) return '—';
        const extra = line.stamp ? ` + ${euro(line.stamp)}` : '';
        const age = lineAge(line);
        return `${item.name}${item.colour ? ` · ${item.colour}` : ''} · ${age === 'youth' ? copy.youth : copy.adult} · Fee ${line.fee} · ${euro(sellPrice(item, channel, line.fee, age))}${extra}`;
      }).join('\n');
    }),
  }));
  return [
    { section: copy.totalPack, label: copy.fieldSeason, values: packs.map((pack) => pack.season.trim() || '—') },
    { label: copy.packPieces, values: totals.map((row) => String(row.pieces)) },
    { label: copy.clubPrice, values: totals.map((row) => euro(row.club)) },
    { label: copy.stamping, values: totals.map((row) => euro(row.stamp)) },
    { label: copy.totalPack, values: totals.map((row) => euro(row.sale)) },
    { label: copy.outsidePack, values: totals.map((row) => euro(row.fuera)) },
    { label: 'PVP', values: totals.map((row) => euro(row.rrp)) },
    { label: copy.margin, values: totals.map((row) => pct(row.margin)) },
    ...composition,
  ];
}

export default function TarifasTool({ onBack }: { onBack: () => void }) {
  const [products, setProducts] = useState<TarifaProduct[]>(SEED);
  const [backend, setBackend] = useState<TarifasBackend>('local');
  const [setupSql, setSetupSql] = useState<string>();
  const [status, setStatus] = useState('');
  const [entry, setEntry] = useState<TarifasEntry | null>(null);
  const [tab, setTab] = useState<TarifasTab>('catalogo');
  const [fee, setFee] = useState<FeeLevel>(1);
  const [query, setQuery] = useState('');
  const [brands, setBrands] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [colours, setColours] = useState<string[]>([]);
  const [sports, setSports] = useState<TarifaSport[]>([]);
  const [genders, setGenders] = useState<TarifaGender[]>([]);
  const [kinds, setKinds] = useState<TarifaKind[]>([]);
  const [novelties, setNovelties] = useState<TarifaNovelty[]>([]);
  const [ages, setAges] = useState<TarifaAgeKind[]>([]);
  const [redYears, setRedYears] = useState<string[]>([]);
  const [packLook, setPackLook] = useState<'table' | 'grid'>('table');
  const [sort, setSort] = useState<'nombre' | 'marca' | 'precio' | 'pvp'>('nombre');
  const [open, setOpen] = useState<TarifaProduct | null>(null);
  const [compare, setCompare] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [zoom, setZoom] = useState<{ src: string; alt: string } | null>(null);
  const [draft, setDraft] = useState<TarifaProduct | null>(null);
  const [packs, setPacks] = useState<PackDraft[]>(() => [emptyPackDraft()]);
  const [activePack, setActivePack] = useState(0);
  const [packCompareOpen, setPackCompareOpen] = useState(false);
  const [packExporting, setPackExporting] = useState<PackDeckFormat | null>(null);
  const [locale, setLocale] = useState<TarifasLocale>('es');
  const [admin, setAdmin] = useState(false);
  const [pin, setPin] = useState('');
  const [askPin, setAskPin] = useState(false);
  const [totpReady, setTotpReady] = useState(false);
  const [totpUri, setTotpUri] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [outletQuote, setOutletQuote] = useState<OutletLine[]>([]);
  const [outletDrafts, setOutletDrafts] = useState<Record<string, OutletLine>>({});
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [sheetAge, setSheetAge] = useState<TarifaAge>('adult');
  const [reservas, setReservas] = useState<ReservasCatalog>(emptyReservasCatalog());
  const [reservasBackend, setReservasBackend] = useState<ReservasBackend>('local');
  const [reservasSql, setReservasSql] = useState<string>();

  useEffect(() => {
    setLocale(readTarifasLocale());
    setAdmin(window.localStorage.getItem(ADMIN_STORAGE) === '1');
    fetch('/api/tarifas-admin').then((res) => res.json()).then((data) => setTotpReady(Boolean(data?.totp))).catch(() => setTotpReady(false));
    loadTarifasCatalog(SEED).then((loaded) => {
      setProducts(loaded.products);
      setBackend(loaded.backend);
      setSetupSql(loaded.setupSql);
    });
    loadReservasCatalog().then((loaded) => {
      setReservas(loaded.catalog);
      setReservasBackend(loaded.backend);
      setReservasSql(loaded.setupSql);
    });
  }, []);

  const currentPack = packs[Math.min(activePack, Math.max(packs.length - 1, 0))] ?? packs[0];
  const pack = currentPack?.lines ?? [];
  const packName = currentPack?.name ?? '';
  const packSeason = currentPack?.season ?? '26/27';
  const filledPacks = packs.filter((item) => item.lines.length > 0);

  const setPack = (update: PackLine[] | ((current: PackLine[]) => PackLine[])) => {
    setPacks((all) => {
      const index = Math.min(activePack, all.length - 1);
      return all.map((item, i) => {
        if (i !== index) return item;
        return { ...item, lines: typeof update === 'function' ? update(item.lines) : update };
      });
    });
  };
  const setPackName = (name: string) => {
    setPacks((all) => all.map((item, i) => (i === activePack ? { ...item, name } : item)));
  };
  const setPackSeason = (season: string) => {
    setPacks((all) => all.map((item, i) => (i === activePack ? { ...item, season } : item)));
  };
  const resetPacks = () => {
    setPacks([emptyPackDraft()]);
    setActivePack(0);
    setPackCompareOpen(false);
  };

  useEffect(() => {
    if (!admin && tab === 'maestro') setTab('catalogo');
  }, [admin, tab]);

  useEffect(() => {
    document.documentElement.classList.add('tarifas-open');
    return () => document.documentElement.classList.remove('tarifas-open');
  }, []);

  useEffect(() => {
    if (window.matchMedia('(max-width: 767px)').matches) setPackLook('grid');
  }, []);

  const copy = TARIFAS_COPY[locale];
  const localeTag = TARIFAS_LOCALE_TAG[locale];
  const euro = (value: number | null | undefined) => formatEuro(value, localeTag);
  const pct = (value: number | null | undefined) => formatPct(value, localeTag);
  const pickLocale = (next: TarifasLocale) => {
    setLocale(next);
    writeTarifasLocale(next);
  };

  const channel: TarifaChannel = entry === 'b2b' ? 'b2b' : 'b2c';
  const inOutlet = entry === 'outlet';
  const fees = channelFees(channel);
  const filtersOn = Boolean(query || brands.length || types.length || colours.length || sports.length || genders.length || kinds.length || novelties.length || ages.length || redYears.length);

  const listing = useMemo(
    () => products.filter((item) => (inOutlet ? item.outlet : !item.outlet)),
    [inOutlet, products],
  );

  const facets = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('es');
    const pass = (item: TarifaProduct, skip: string) => {
      if (skip !== 'brand' && !picked(brands, item.brand)) return false;
      if (skip !== 'type' && !picked(types, item.productType)) return false;
      if (skip !== 'colour' && !picked(colours, item.colour)) return false;
      if (skip !== 'sport' && !picked(sports, item.sport)) return false;
      if (skip !== 'gender' && !picked(genders, item.gender)) return false;
      if (skip !== 'kind' && !picked(kinds, kindOf(item))) return false;
      if (skip !== 'novelty' && !picked(novelties, item.novelty)) return false;
      if (skip !== 'age' && !picked(ages, ageKind(item))) return false;
      if (skip !== 'redYear' && !picked(redYears, yearOf(item))) return false;
      if (skip !== 'query' && q) {
        const hay = `${item.brand} ${item.productType} ${item.name} ${item.colour} ${item.collection} ${item.adultRef} ${item.youthRef}`.toLocaleLowerCase('es');
        if (!hay.includes(q)) return false;
      }
      return true;
    };
    const pool = (skip: string) => listing.filter((item) => pass(item, skip));
    return {
      brands: keepSelected(uniqueSorted(pool('brand'), 'brand'), brands),
      types: keepSelected(uniqueSorted(pool('type'), 'productType'), types),
      colours: keepSelected(uniqueSorted(pool('colour'), 'colour'), colours),
      sports: keepSelected(
        SPORTS.filter((item) => pool('sport').some((row) => row.sport === item)),
        sports,
      ) as TarifaSport[],
      genders: keepSelected(
        GENDERS.filter((item) => pool('gender').some((row) => row.gender === item)),
        genders,
      ) as TarifaGender[],
      kinds: KINDS.filter((item) => kinds.includes(item) || pool('kind').some((row) => kindOf(row) === item)),
      novelties: NOVELTIES.filter((item) => novelties.includes(item) || pool('novelty').some((row) => row.novelty === item)),
      ages: (['both', 'adult', 'youthOnly'] as TarifaAgeKind[]).filter(
        (item) => ages.includes(item) || pool('age').some((row) => ageKind(row) === item),
      ),
      years: keepSelected(
        Array.from(new Set(pool('redYear').map(yearOf))).sort((a, b) => a.localeCompare(b, 'es')),
        redYears,
      ),
    };
  }, [ages, brands, colours, genders, kinds, listing, novelties, query, redYears, sports, types]);

  const clearFilters = () => {
    setQuery('');
    setBrands([]);
    setTypes([]);
    setColours([]);
    setSports([]);
    setGenders([]);
    setKinds([]);
    setNovelties([]);
    setAges([]);
    setRedYears([]);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('es');
    const rows = listing.filter((item) => {
      if (!picked(brands, item.brand)) return false;
      if (!picked(types, item.productType)) return false;
      if (!picked(colours, item.colour)) return false;
      if (!picked(sports, item.sport)) return false;
      if (!picked(genders, item.gender)) return false;
      if (!picked(kinds, kindOf(item))) return false;
      if (!picked(novelties, item.novelty)) return false;
      if (!picked(ages, ageKind(item))) return false;
      if (!picked(redYears, yearOf(item))) return false;
      if (q) {
        const hay = `${item.brand} ${item.productType} ${item.name} ${item.colour} ${item.collection} ${item.adultRef} ${item.youthRef}`.toLocaleLowerCase('es');
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    return rows.slice().sort((a, b) => {
      if (sort === 'marca') return a.brand.localeCompare(b.brand, 'es') || a.name.localeCompare(b.name, 'es');
      if (sort === 'precio') {
        if (inOutlet) return (outletCost(a) ?? 0) - (outletCost(b) ?? 0);
        return (sellPrice(a, channel, fee) ?? 0) - (sellPrice(b, channel, fee) ?? 0);
      }
      if (sort === 'pvp') return (rrpPrice(a, channel) ?? 0) - (rrpPrice(b, channel) ?? 0);
      return a.name.localeCompare(b.name, 'es') || a.colour.localeCompare(b.colour, 'es');
    });
  }, [ages, brands, channel, colours, fee, genders, inOutlet, kinds, listing, novelties, query, redYears, sort, sports, types]);

  const totals = useMemo(
    () => (channel ? packTotals(products, pack, channel) : { pieces: 0, club: 0, stamp: 0, sale: 0, rrp: 0, fuera: 0, margin: null }),
    [channel, pack, products],
  );
  const quoteTotals = useMemo(() => outletTotals(products, outletQuote), [outletQuote, products]);
  const byId = useMemo(() => new Map(products.map((item) => [item.id, item])), [products]);
  const compareItems = useMemo(
    () => compare.map((id) => byId.get(id)).filter((item): item is TarifaProduct => Boolean(item)),
    [byId, compare],
  );
  const openPhoto = (src: string, alt: string) => setZoom({ src, alt });
  const editing = admin && (tab === 'maestro' || inOutlet);
  const shopTab = tab === 'catalogo';
  const visibleTabs = [
    { id: 'catalogo', label: inOutlet ? copy.outlet : copy.catalog },
    ...(!inOutlet ? [
      { id: 'pack', label: copy.pack },
      { id: 'reservas', label: copy.reservas },
    ] : []),
    ...(admin ? [{ id: 'maestro', label: copy.master }] : []),
  ];

  const persistReservas = async (next: ReservasCatalog) => {
    setReservas(next);
    try {
      await saveReservasCatalog(next, reservasBackend);
      setStatus(reservasBackend === 'supabase' ? copy.savedNetwork : copy.savedLocal);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : copy.saveError);
    }
  };

  const persist = async (next: TarifaProduct[]) => {
    setProducts(next);
    try {
      await saveTarifasCatalog(next, backend);
      setStatus(backend === 'supabase' ? copy.savedNetwork : copy.savedLocal);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : copy.saveError);
    }
  };

  const outletLineOf = (item: TarifaProduct): OutletLine => {
    const quoted = outletQuote.find((line) => line.id === item.id);
    if (quoted) return quoted;
    return outletDrafts[item.id] || emptyOutletLine(item);
  };

  const writeOutletLine = (item: TarifaProduct, next: OutletLine) => {
    setOutletDrafts((current) => ({ ...current, [item.id]: next }));
    setOutletQuote((current) => current.map((line) => (line.id === item.id ? next : line)));
  };

  const toggleOutlet = (item: TarifaProduct) => {
    const next = outletLineOf(item);
    setOutletDrafts((current) => ({ ...current, [item.id]: next }));
    setOutletQuote((current) => (
      current.some((line) => line.id === item.id)
        ? current.filter((line) => line.id !== item.id)
        : [...current, next]
    ));
  };

  const addToPack = (item: TarifaProduct, chosenFee = fee, age?: TarifaAge) => {
    const chosen = packAgeOf(item, age);
    setPack((current) => {
      if (current.some((line) => line.id === item.id && line.fee === chosenFee && lineAge(line) === chosen)) return current;
      return [...current, { id: item.id, fee: chosenFee, age: chosen, stamp: 0, stampInput: '' }];
    });
    setCartOpen(true);
  };

  const patchPackLine = (index: number, patch: Partial<PackLine>) => {
    setPack((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const movePackLine = (index: number, dir: -1 | 1) => {
    setPack((current) => {
      const next = index + dir;
      if (next < 0 || next >= current.length) return current;
      const ordered = [...current];
      const [line] = ordered.splice(index, 1);
      ordered.splice(next, 0, line);
      return ordered;
    });
  };

  const toggleCompare = (id: string) => {
    setCompare((current) => {
      if (current.includes(id)) {
        const next = current.filter((item) => item !== id);
        if (next.length < 2) setCompareOpen(false);
        return next;
      }
      if (current.length >= COMPARE_MAX) return current;
      return [...current, id];
    });
  };

  const moveCompare = (id: string, dir: -1 | 1) => {
    setCompare((current) => {
      const index = current.indexOf(id);
      const next = index + dir;
      if (index < 0 || next < 0 || next >= current.length) return current;
      const ordered = [...current];
      const [item] = ordered.splice(index, 1);
      ordered.splice(next, 0, item);
      return ordered;
    });
  };

  const addPackSlot = () => {
    if (packs.length >= COMPARE_MAX) return;
    const created = emptyPackDraft(packSeason || '26/27');
    setPacks((all) => [...all, created]);
    setActivePack(packs.length);
  };

  const duplicatePack = () => {
    if (packs.length >= COMPARE_MAX) return;
    const source = currentPack;
    if (!source) return;
    const clone: PackDraft = {
      id: newId('pack'),
      name: source.name.trim() ? `${source.name.trim()} 2` : '',
      season: source.season,
      lines: source.lines.map((line) => ({ ...line })),
    };
    setPacks((all) => [...all, clone]);
    setActivePack(packs.length);
  };

  const removePackSlot = () => {
    if (packs.length <= 1) return;
    const currentId = currentPack?.id;
    const next = packs.filter((item) => item.id !== currentId);
    setPacks(next.length ? next : [emptyPackDraft()]);
    setActivePack(Math.max(0, activePack - 1));
    if (next.filter((item) => item.lines.length > 0).length < 2) setPackCompareOpen(false);
  };

  const movePack = (id: string, dir: -1 | 1) => {
    const filled = packs.filter((item) => item.lines.length > 0);
    const index = filled.findIndex((item) => item.id === id);
    const next = index + dir;
    if (index < 0 || next < 0 || next >= filled.length) return;
    const from = packs.findIndex((item) => item.id === filled[index].id);
    const to = packs.findIndex((item) => item.id === filled[next].id);
    const ordered = [...packs];
    const currentId = currentPack?.id;
    const swap = ordered[from];
    ordered[from] = ordered[to];
    ordered[to] = swap;
    setPacks(ordered);
    setActivePack(Math.max(0, ordered.findIndex((item) => item.id === currentId)));
  };

  const enterAdmin = (otpauth?: string | null) => {
    window.localStorage.setItem(ADMIN_STORAGE, '1');
    setAdmin(true);
    setAskPin(false);
    setPin('');
    setTotpUri(otpauth || null);
    setTab('maestro');
  };

  const exitAdmin = () => {
    window.localStorage.removeItem(ADMIN_STORAGE);
    setAdmin(false);
    setAskPin(false);
    setPin('');
    setTotpUri(null);
    if (tab === 'maestro') setTab('catalogo');
  };

  const tryAdmin = async () => {
    const value = pin.trim();
    try {
      const res = await fetch('/api/tarifas-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(/^\d{6}$/.test(value) ? { code: value } : { pin: value }),
      });
      const data = await res.json().catch(() => ({})) as { ok?: boolean; otpauth?: string };
      if (!res.ok || !data.ok) {
        setStatus(copy.adminWrong);
        return;
      }
      enterAdmin(data.otpauth);
    } catch {
      if (value === ADMIN_KEY) {
        enterAdmin(null);
        return;
      }
      setStatus(copy.adminWrong);
    }
  };

  const pickEntry = (next: TarifasEntry) => {
    setEntry(next);
    setFee(1);
    setTab('catalogo');
    resetPacks();
    setCompare([]);
    setCompareOpen(false);
    setOutletQuote([]);
    setOutletDrafts({});
    setQuoteOpen(false);
    clearFilters();
  };

  const openItem = (item: TarifaProduct) => {
    setOpen(item);
    setDraft(asProduct(item));
    setSheetAge(packAgeOf(item));
  };

  const saveDraft = async () => {
    if (!draft) return;
    const saved = draft.outlet ? asOutletProduct(asProduct(draft)) : { ...asProduct(draft), outlet: false };
    const next = products.some((item) => item.id === saved.id)
      ? products.map((item) => (item.id === saved.id ? saved : item))
      : [saved, ...products];
    await persist(next);
    setOpen(saved);
    setDraft(saved);
  };

  const downloadSheet = async (rows: unknown[][], sheet: string, filename: string) => {
    const XLSX = await import('xlsx');
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), sheet);
    XLSX.writeFile(workbook, filename);
  };

  const liveProducts = () => products.filter((item) => !item.outlet);
  const outletProducts = () => products.filter((item) => item.outlet);
  const downloadCatalog = () => downloadSheet(productExportRows(liveProducts()), 'Productos', 'Tarifas_productos.xlsx');
  const downloadB2c = () => downloadSheet(b2cExportRows(liveProducts()), 'B2C', 'Tarifas_B2C.xlsx');
  const downloadB2b = () => downloadSheet(b2bExportRows(liveProducts()), 'B2B', 'Tarifas_B2B.xlsx');
  const downloadOutletZone = () => downloadSheet(outletExportRows(outletProducts()), 'Outlet', 'Tarifas_outlet.xlsx');

  const downloadPack = async (format: PackDeckFormat) => {
    if (!channel || pack.length === 0 || packExporting) return;
    setPackExporting(format);
    try {
      const deck = buildPackDeck({
        products,
        lines: pack,
        channel,
        name: packName,
        season: packSeason,
        copy,
        locale,
        localeTag,
      });
      const response = await fetch('/api/tarifas-pack-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format, deck }),
      });
      if (!response.ok) throw new Error('export');
      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href;
      link.download = `${deck.fileSlug}.${format === 'pptx' ? 'pptx' : 'xlsx'}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);
    } catch {
      setStatus(copy.saveError);
    } finally {
      setPackExporting(null);
    }
  };

  const downloadOutletQuote = async () => {
    const XLSX = await import('xlsx');
    const workbook = XLSX.utils.book_new();
    const table = outletQuoteExportRows(products, outletQuote, copy.outletHeaders, localeTag);
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(table), 'Outlet');
    XLSX.writeFile(workbook, 'Outlet_seleccion.xlsx');
  };

  const withPhotos = (incoming: TarifaProduct[], source: TarifaProduct[], markOutlet: boolean) => {
    const photos = new Map<string, string>();
    source.forEach((item) => {
      if (!item.image) return;
      if (item.adultRef) photos.set(item.adultRef, item.image);
      if (item.youthRef) photos.set(item.youthRef, item.image);
    });
    return incoming.map((item) => {
      const withPhoto = item.image ? item : { ...item, image: photos.get(item.adultRef) || photos.get(item.youthRef) || null };
      return markOutlet ? asOutletProduct(withPhoto) : { ...withPhoto, outlet: false };
    });
  };

  const importZone = async (sheets: Record<string, unknown[][]>, zone: IngestZone) => {
    const parsed = parseTarifasWorkbook(sheets);
    const live = liveProducts();
    const outletKeep = outletProducts();

    if (zone === 'outlet') {
      const source = parsed.outlet.length ? parsed.outlet : parsed.combined;
      if (!source.length) {
        setStatus(copy.emptyExcel);
        return;
      }
      const incoming = withPhotos(source, outletKeep, true);
      await persist([...live, ...incoming]);
      setStatus(`${incoming.length.toLocaleString(localeTag)} ${copy.imported}`);
      return;
    }

    if (zone === 'b2c' || zone === 'b2b') {
      const rows = zone === 'b2c'
        ? (parsed.b2c.length ? parsed.b2c : parsed.combined.map((item) => ({ adultRef: item.adultRef, youthRef: item.youthRef, b2c: item.b2c })))
        : (parsed.b2b.length ? parsed.b2b : parsed.combined.map((item) => ({ adultRef: item.adultRef, youthRef: item.youthRef, b2b: item.b2b })));
      if (!rows.length) {
        setStatus(copy.emptyExcel);
        return;
      }
      const result = overlayChannelPrices(live, rows, zone);
      if (result.applied === 0) {
        setStatus(copy.emptyExcel);
        return;
      }
      await persist([...result.products, ...outletKeep]);
      const missing = result.missing ? ` ${result.missing.toLocaleString(localeTag)} ${copy.importedMissing}` : '';
      setStatus(`${result.applied.toLocaleString(localeTag)} ${copy.importedPrices}${missing}`);
      return;
    }

    const source = parsed.productos.length ? parsed.productos : parsed.combined;
    if (!source.length) {
      setStatus(copy.emptyExcel);
      return;
    }
    let incoming = withPhotos(mergeKeptPrices(source, live), live, false);
    if (parsed.b2c.length) incoming = overlayChannelPrices(incoming, parsed.b2c, 'b2c').products;
    if (parsed.b2b.length) incoming = overlayChannelPrices(incoming, parsed.b2b, 'b2b').products;
    await persist([...incoming, ...outletKeep]);
    setStatus(`${incoming.length.toLocaleString(localeTag)} ${copy.imported}`);
  };

  if (!entry) {
    return (
      <div className="tarifas-shell min-h-dvh bg-white px-4 py-6 sm:-mx-6 sm:-mb-8 sm:min-h-[calc(100vh-4.5rem)] sm:px-6 sm:py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <LangSwitch locale={locale} onChange={pickLocale} copy={copy} />
          <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm text-neutral-500">
            <ArrowLeft className="h-4 w-4" /> {copy.tools}
          </button>
        </div>
        <div className="mx-auto mt-8 max-w-2xl text-center sm:mt-16">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Tarifas 26/27</p>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-5xl">{copy.whichTariff}</h2>
          <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-neutral-500">
            {copy.tariffHint}
          </p>
        </div>
        <div className="mx-auto mt-12 grid max-w-4xl gap-4 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => pickEntry('b2c')}
            className="rounded-[28px] border border-neutral-200 bg-white p-6 text-left transition hover:border-neutral-900 sm:p-8"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-400">{copy.clubsWeb}</p>
            <p className="mt-2 font-display text-3xl font-semibold">B2C</p>
            <p className="mt-2 text-sm text-neutral-500">{copy.b2cFees}</p>
          </button>
          <button
            type="button"
            onClick={() => pickEntry('b2b')}
            className="rounded-[28px] border border-neutral-200 bg-white p-6 text-left transition hover:border-neutral-900 sm:p-8"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-400">{copy.distribution}</p>
            <p className="mt-2 font-display text-3xl font-semibold">B2B</p>
            <p className="mt-2 text-sm text-neutral-500">{copy.b2bFees}</p>
          </button>
          <button
            type="button"
            onClick={() => pickEntry('outlet')}
            className="rounded-[28px] border border-neutral-200 bg-white p-6 text-left transition hover:border-neutral-900 sm:p-8"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-400">{copy.outletTitle}</p>
            <p className="mt-2 font-display text-3xl font-semibold">{copy.outlet}</p>
            <p className="mt-2 text-sm text-neutral-500">{copy.outletDoorHint}</p>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="tarifas-shell min-h-dvh bg-white px-4 pb-[calc(6.75rem+env(safe-area-inset-bottom))] pt-3 sm:-mx-6 sm:-mb-8 sm:min-h-[calc(100vh-4.5rem)] sm:px-8 sm:pb-24 sm:pt-4">
      <div className="space-y-3 sm:space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <LangSwitch locale={locale} onChange={pickLocale} copy={copy} />
            {admin ? (
              <>
                <button
                  type="button"
                  onClick={() => setTab('maestro')}
                  className="rounded-full bg-neutral-900 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white"
                >
                  {copy.adminOn}
                </button>
                <button
                  type="button"
                  onClick={exitAdmin}
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold text-neutral-500 hover:bg-neutral-50"
                >
                  <LogOut className="h-3.5 w-3.5" /> {copy.adminExit}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setAskPin((open) => !open)}
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold text-neutral-400 hover:bg-neutral-50 hover:text-neutral-700"
                aria-label={copy.adminUnlock}
              >
                <Lock className="h-3.5 w-3.5" /> {copy.adminUnlock}
              </button>
            )}
            {askPin && !admin ? (
              <form
                className="flex items-center gap-1"
                onSubmit={(event) => {
                  event.preventDefault();
                  void tryAdmin();
                }}
              >
                <input
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder={totpReady ? copy.adminCode : copy.adminUnlock}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  className="h-8 w-40 rounded-full border border-neutral-200 px-3 text-xs outline-none"
                />
                <button type="button" onClick={() => void tryAdmin()} className="h-8 rounded-full bg-neutral-900 px-3 text-[11px] font-semibold text-white">{copy.adminEnter}</button>
              </form>
            ) : null}
            {askPin && !admin && status ? <p className="text-[11px] text-red-600">{status}</p> : null}
          </div>
          <WorkspaceChrome
            onBack={() => {
              setEntry(null);
              resetPacks();
              setTab('catalogo');
              setCompare([]);
              setCompareOpen(false);
            }}
            backLabel={copy.lists}
            tabs={visibleTabs}
            active={tab}
            onSelect={(id) => setTab(id as TarifasTab)}
          />
        </div>

        {tab === 'catalogo' && !inOutlet ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">{channel.toUpperCase()}</p>
        ) : (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
              {inOutlet ? copy.outlet : channel.toUpperCase()}{tab === 'pack' ? ` · ${copy.pack}` : tab === 'maestro' ? ` · ${copy.master}` : tab === 'reservas' ? ` · ${copy.reservas}` : ''}
            </p>
            <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-4xl">
              {tab === 'pack' ? copy.packBuilder : tab === 'maestro' ? copy.liveCatalog : tab === 'reservas' ? copy.reservasTitle : copy.outletTitle}
            </h2>
          </div>
        )}

        {shopTab && !inOutlet ? (
          <div>
            <p className="mb-2 hidden text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400 sm:block">{copy.tariff}</p>
            <div className="flex flex-wrap gap-2">
              {fees.map((level) => (
                <Pill key={level} active={fee === level} onClick={() => setFee(level)}>Fee {level}</Pill>
              ))}
            </div>
          </div>
        ) : null}

        {tab === 'reservas' ? (
          <ReservasPanel
            products={products}
            pack={pack}
            catalog={reservas}
            copy={copy}
            locale={locale}
          />
        ) : tab === 'catalogo' || tab === 'maestro' ? (
          <>
            {tab === 'maestro' ? (
              <div className="space-y-3">
                <p className="text-sm text-neutral-500">{copy.masterHint}</p>
                <div className="grid gap-3 lg:grid-cols-2">
                  <IngestCard
                    kicker={copy.sectionProduct}
                    hint={copy.masterUploadHint}
                    inputId="tarifas-productos"
                    label={copy.masterUpload}
                    onWorkbook={(sheets) => void importZone(sheets, 'productos')}
                    downloadLabel={copy.downloadMaster}
                    onDownload={() => void downloadCatalog()}
                    extra={(
                      <button
                        type="button"
                        onClick={() => {
                          const created = emptyProduct();
                          created.season = '26/27';
                          created.outlet = false;
                          openItem(created);
                        }}
                        className="inline-flex h-10 items-center gap-2 rounded-full bg-neutral-900 px-4 text-xs font-semibold text-white"
                      >
                        <Plus className="h-4 w-4" /> {copy.newReference}
                      </button>
                    )}
                  />
                  <IngestCard
                    kicker="B2C"
                    hint={copy.b2cIngestHint}
                    inputId="tarifas-b2c"
                    label={copy.b2cUpload}
                    onWorkbook={(sheets) => void importZone(sheets, 'b2c')}
                    downloadLabel={copy.downloadB2c}
                    onDownload={() => void downloadB2c()}
                  />
                  <IngestCard
                    kicker="B2B"
                    hint={copy.b2bIngestHint}
                    inputId="tarifas-b2b"
                    label={copy.b2bUpload}
                    onWorkbook={(sheets) => void importZone(sheets, 'b2b')}
                    downloadLabel={copy.downloadB2b}
                    onDownload={() => void downloadB2b()}
                  />
                  <IngestCard
                    kicker={copy.outlet}
                    hint={copy.outletHint}
                    inputId="tarifas-outlet"
                    label={copy.outletUpload}
                    onWorkbook={(sheets) => void importZone(sheets, 'outlet')}
                    downloadLabel={copy.downloadOutlet}
                    onDownload={() => void downloadOutletZone()}
                    extra={(
                      <button
                        type="button"
                        onClick={() => {
                          const created = asOutletProduct(emptyProduct());
                          created.season = '';
                          openItem(created);
                        }}
                        className="inline-flex h-10 items-center gap-2 rounded-full bg-neutral-900 px-4 text-xs font-semibold text-white"
                      >
                        <Plus className="h-4 w-4" /> {copy.newOutletRef}
                      </button>
                    )}
                  />
                </div>
                {status ? <p className="text-xs text-neutral-500">{status}</p> : null}
                {setupSql ? <p className="text-xs text-amber-700">{copy.setupSql}</p> : null}
              </div>
            ) : null}
            {tab === 'maestro' && totpUri ? (
              <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-neutral-200 p-4">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(totpUri)}`}
                  alt={copy.adminCode}
                  className="h-40 w-40 rounded-xl border border-neutral-100 bg-white"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">{copy.adminCode}</p>
                  <p className="mt-1 text-sm text-neutral-500">{copy.adminTotpHint}</p>
                </div>
              </div>
            ) : null}
            {tab === 'maestro' ? (
              <ReservasMaestro
                products={products.filter((item) => !item.outlet)}
                catalog={reservas}
                copy={copy}
                localeTag={localeTag}
                setupSql={reservasSql}
                onChange={(next) => { void persistReservas(next); }}
              />
            ) : null}

            <div className="space-y-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                <label className="relative w-full shrink-0 sm:w-[18rem] sm:max-w-full">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={copy.search}
                    className="h-11 w-full rounded-full border border-neutral-200 bg-white py-0 pl-9 pr-4 outline-none sm:h-10"
                  />
                </label>
                <div className="flex items-center gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:contents [&::-webkit-scrollbar]:hidden">
                <FilterSelect
                  label={copy.type}
                  options={facets.types.map((item) => ({ value: item, label: labelProductType(locale, item) }))}
                  selected={types}
                  onToggle={(value) => setTypes(toggleItem(types, value))}
                  onClear={() => setTypes([])}
                  onSet={setTypes}
                  copy={copy}
                />
                <FilterSelect
                  label={copy.colour}
                  options={facets.colours.map((item) => ({ value: item, label: item }))}
                  selected={colours}
                  onToggle={(value) => setColours(toggleItem(colours, value))}
                  onClear={() => setColours([])}
                  onSet={setColours}
                  copy={copy}
                />
                <div className="relative shrink-0">
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value as typeof sort)}
                    className="h-10 appearance-none rounded-full border border-neutral-200 bg-white pl-3 pr-8 text-sm text-neutral-600"
                  >
                    <option value="nombre">{copy.sortName}</option>
                    <option value="marca">{copy.sortBrand}</option>
                    <option value="precio">{copy.sortPrice}</option>
                    <option value="pvp">{copy.sortPvp}</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
                </div>
                </div>
              </div>
              <div className="flex items-center gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:flex-wrap sm:overflow-visible [&::-webkit-scrollbar]:hidden">
                <FilterSelect
                  label={copy.gender}
                  options={facets.genders.map((item) => ({ value: item, label: copy.genders[item] }))}
                  selected={genders}
                  onToggle={(value) => setGenders(toggleItem(genders, value as TarifaGender))}
                  onClear={() => setGenders([])}
                  onSet={(values) => setGenders(values as TarifaGender[])}
                  copy={copy}
                />
                <FilterSelect
                  label={copy.sport}
                  options={facets.sports.map((item) => ({ value: item, label: copy.sports[item as TarifaSport] || item }))}
                  selected={sports}
                  onToggle={(value) => setSports(toggleItem(sports, value as TarifaSport))}
                  onClear={() => setSports([])}
                  onSet={(values) => setSports(values as TarifaSport[])}
                  copy={copy}
                />
                <FilterSelect
                  label={copy.fieldKind}
                  options={facets.kinds.map((item) => ({ value: item, label: copy.kinds[item] }))}
                  selected={kinds}
                  onToggle={(value) => setKinds(toggleItem(kinds, value as TarifaKind))}
                  onClear={() => setKinds([])}
                  onSet={(values) => setKinds(values as TarifaKind[])}
                  copy={copy}
                />
                <FilterSelect
                  label={copy.audience}
                  options={facets.ages.map((item) => ({
                    value: item,
                    label: item === 'both' ? copy.adultAndYouth : item === 'youthOnly' ? copy.youthOnly : copy.adultOnly,
                  }))}
                  selected={ages}
                  onToggle={(value) => setAges(toggleItem(ages, value as TarifaAgeKind))}
                  onClear={() => setAges([])}
                  onSet={(values) => setAges(values as TarifaAgeKind[])}
                  copy={copy}
                />
                <FilterSelect
                  label={copy.brands}
                  options={facets.brands.map((item) => ({ value: item, label: item }))}
                  selected={brands}
                  onToggle={(value) => setBrands(toggleItem(brands, value))}
                  onClear={() => setBrands([])}
                  onSet={setBrands}
                  copy={copy}
                />
                <FilterSelect
                  label={copy.validity}
                  options={facets.years.map((item) => ({ value: item, label: item === 'none' ? copy.noValidity : item }))}
                  selected={redYears}
                  onToggle={(value) => setRedYears(toggleItem(redYears, value))}
                  onClear={() => setRedYears([])}
                  onSet={setRedYears}
                  copy={copy}
                />
                {facets.novelties.length > 0 ? (
                  <FilterSelect
                    label={copy.fieldNovelty}
                    options={facets.novelties.map((item) => ({ value: item, label: copy.novelties[item] }))}
                    selected={novelties}
                    onToggle={(value) => setNovelties(toggleItem(novelties, value as TarifaNovelty))}
                    onClear={() => setNovelties([])}
                    onSet={(values) => setNovelties(values as TarifaNovelty[])}
                    copy={copy}
                  />
                ) : null}
                {filtersOn ? (
                  <button type="button" onClick={clearFilters} className="h-10 shrink-0 rounded-full border border-neutral-200 px-4 text-xs font-semibold text-neutral-600 hover:bg-neutral-50">
                    {copy.clearFilters}
                  </button>
                ) : null}
              </div>
            </div>

            <p className="text-xs tabular-nums text-neutral-400">{filtered.length.toLocaleString(localeTag)} {copy.products}</p>

            {filtered.length === 0 ? (
              <p className="py-16 text-center text-sm text-neutral-400">
                {inOutlet && listing.length === 0 && !filtersOn ? copy.outletEmpty : copy.emptyFilters}
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {filtered.map((item) => (
                  <article key={item.id} className={`group overflow-hidden rounded-2xl border bg-white ${compare.includes(item.id) ? 'border-neutral-900' : 'border-neutral-200'}`}>
                    <div className="relative z-[1] aspect-[4/3] bg-neutral-50 sm:aspect-square">
                      <TarifasPhoto
                        key={item.image || item.id}
                        src={item.image}
                        alt={item.name}
                        className="h-full w-full p-4 transition group-hover:scale-[1.02]"
                        onOpen={item.image ? openPhoto : undefined}
                      />
                      {!item.image ? (
                        <button type="button" onClick={() => openItem(item)} className="absolute inset-0" aria-label={item.name} />
                      ) : null}
                      {ageKind(item) === 'adult' ? (
                        <span className="pointer-events-none absolute left-2 top-2">
                          <AgeChip tone="adult">{copy.adultOnly}</AgeChip>
                        </span>
                      ) : null}
                      {ageKind(item) === 'youthOnly' ? (
                        <span className="pointer-events-none absolute left-2 top-2">
                          <AgeChip tone="youth">{copy.youthOnly}</AgeChip>
                        </span>
                      ) : null}
                      {isExpired(item.red) ? (
                        <span className="pointer-events-none absolute right-2 top-2 rounded-full bg-neutral-900/80 px-2 py-0.5 text-[10px] font-semibold text-white">{copy.expired}</span>
                      ) : null}
                      {item.novelty === 'Nueva' ? (
                        <span className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold">{copy.newBadge}</span>
                      ) : null}
                      {item.outlet ? (
                        <span className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900">{copy.outletBadge}</span>
                      ) : null}
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openItem(item);
                        }}
                        className="absolute -bottom-3 right-2 z-10 inline-flex h-9 items-center gap-1 rounded-full bg-white px-2.5 text-[11px] font-semibold text-neutral-800 shadow-sm ring-1 ring-black/10"
                        aria-label={copy.viewSheet}
                      >
                        <Info className="h-3.5 w-3.5" />
                        <span>{copy.viewSheet}</span>
                      </button>
                    </div>
                    <button type="button" onClick={() => openItem(item)} className="block w-full text-left">
                      <div className="space-y-1 px-3 pb-3 pt-5">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
                          {item.brand} · {labelProductType(locale, item.productType)}
                        </p>
                        <p className="line-clamp-2 font-display text-[15px] font-semibold leading-snug">{item.name}</p>
                        <p className="truncate text-[11px] text-neutral-500">{item.colour}</p>
                        {inOutlet ? null : (
                          <>
                            <p className="pt-1 font-display text-lg font-semibold tabular-nums">{euro(sellPrice(item, channel, fee, 'adult'))}</p>
                            <PvpLines item={item} channel={channel} mode={ages} copy={copy} localeTag={localeTag} />
                          </>
                        )}
                      </div>
                    </button>
                    {inOutlet && shopTab ? (
                      <div className="px-3 pb-3">
                        <OutletPriceControl
                          item={item}
                          line={outletLineOf(item)}
                          copy={copy}
                          euro={euro}
                          pct={pct}
                          onChange={(next) => writeOutletLine(item, next)}
                        />
                      </div>
                    ) : null}
                    {shopTab ? (
                      <div className="flex gap-2 px-3 pb-3">
                        <button
                          type="button"
                          onClick={() => toggleCompare(item.id)}
                          disabled={!compare.includes(item.id) && compare.length >= COMPARE_MAX}
                          className={`inline-flex h-11 flex-1 items-center justify-center gap-1 rounded-full border text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${
                            compare.includes(item.id)
                              ? 'border-neutral-900 bg-neutral-900 text-white'
                              : 'border-neutral-200 text-neutral-700 hover:bg-neutral-50'
                          }`}
                        >
                          <Columns2 className="h-3.5 w-3.5" /> {compare.includes(item.id) ? copy.compareOn : copy.compare}
                        </button>
                        {inOutlet ? (
                          <button
                            type="button"
                            onClick={() => toggleOutlet(item)}
                            className={`inline-flex h-11 flex-1 items-center justify-center gap-1 rounded-full border text-[11px] font-semibold ${
                              outletQuote.some((line) => line.id === item.id)
                                ? 'border-neutral-900 bg-neutral-900 text-white'
                                : 'border-neutral-200 text-neutral-700 hover:bg-neutral-50'
                            }`}
                          >
                            <Plus className="h-3.5 w-3.5" /> {outletQuote.some((line) => line.id === item.id) ? copy.chosenOutlet : copy.chooseOutlet}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => addToPack(item)}
                            className="inline-flex h-11 flex-1 items-center justify-center gap-1 rounded-full border border-neutral-200 text-[11px] font-semibold text-neutral-700 hover:bg-neutral-50"
                          >
                            <Plus className="h-3.5 w-3.5" /> {copy.addToPack}
                          </button>
                        )}
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="mx-auto max-w-6xl space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {packs.map((item, index) => (
                <Pill key={item.id} active={index === activePack} onClick={() => setActivePack(index)}>
                  {packDraftLabel(item, copy.pack, index)}
                  {item.lines.length ? ` · ${item.lines.length}` : ''}
                </Pill>
              ))}
              <div className="ml-auto flex items-center gap-1 rounded-full border border-neutral-200 p-1">
                <button
                  type="button"
                  onClick={() => setPackLook('grid')}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold ${packLook === 'grid' ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:text-neutral-800'}`}
                >
                  <LayoutGrid className="h-3.5 w-3.5" /> {copy.packViewGrid}
                </button>
                <button
                  type="button"
                  onClick={() => setPackLook('table')}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold ${packLook === 'table' ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:text-neutral-800'}`}
                >
                  <Table2 className="h-3.5 w-3.5" /> {copy.packViewTable}
                </button>
              </div>
              {packs.length < COMPARE_MAX ? (
                <button type="button" onClick={addPackSlot} className="inline-flex h-9 items-center gap-1 rounded-full border border-neutral-200 px-3 text-xs font-semibold text-neutral-600">
                  <Plus className="h-3.5 w-3.5" /> {copy.newPack}
                </button>
              ) : null}
              {pack.length > 0 && packs.length < COMPARE_MAX ? (
                <button type="button" onClick={duplicatePack} className="inline-flex h-9 items-center gap-1 rounded-full border border-neutral-200 px-3 text-xs font-semibold text-neutral-600">
                  <Copy className="h-3.5 w-3.5" /> {copy.duplicatePack}
                </button>
              ) : null}
              {packs.length > 1 ? (
                <button type="button" onClick={removePackSlot} className="text-xs font-semibold text-neutral-400">{copy.removeThisPack}</button>
              ) : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-400">{copy.packName}</span>
                <input
                  value={packName}
                  onChange={(event) => setPackName(event.target.value)}
                  placeholder={copy.packNameHint}
                  className="h-10 w-full rounded-lg border border-neutral-200 px-3 text-sm outline-none"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-400">{copy.fieldSeason}</span>
                <input
                  value={packSeason}
                  onChange={(event) => setPackSeason(event.target.value)}
                  placeholder="26/27"
                  className="h-10 w-full rounded-lg border border-neutral-200 px-3 text-sm outline-none"
                />
              </label>
            </div>
            {pack.length === 0 ? (
              <p className="py-16 text-center text-sm text-neutral-400">
                {copy.emptyPack}
              </p>
            ) : packLook === 'grid' ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {pack.map((line, index) => {
                  const item = byId.get(line.id);
                  if (!item) return null;
                  const age = lineAge(line);
                  const price = sellPrice(item, channel, line.fee, age);
                  return (
                    <article key={`${line.id}-${line.fee}-${age}-${index}`} className="group overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                      <div className="relative aspect-square bg-neutral-50">
                        <TarifasPhoto
                          src={item.image}
                          alt={item.name}
                          className="h-full w-full p-6 transition group-hover:scale-[1.02]"
                          onOpen={item.image ? openPhoto : undefined}
                        />
                        {!item.image ? (
                          <button type="button" onClick={() => openItem(item)} className="absolute inset-0" aria-label={item.name} />
                        ) : null}
                        <div className="absolute left-2 top-2 z-10 flex items-center gap-1">
                          <button
                            type="button"
                            disabled={index === 0}
                            onClick={(event) => { event.stopPropagation(); movePackLine(index, -1); }}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-neutral-700 shadow-sm ring-1 ring-black/10 disabled:opacity-30"
                            aria-label={copy.compareForward}
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </button>
                          <span className="inline-flex h-8 min-w-[2rem] items-center justify-center rounded-full bg-white px-2 text-[11px] font-semibold tabular-nums text-neutral-500 shadow-sm ring-1 ring-black/10">
                            {index + 1}
                          </span>
                          <button
                            type="button"
                            disabled={index === pack.length - 1}
                            onClick={(event) => { event.stopPropagation(); movePackLine(index, 1); }}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-neutral-700 shadow-sm ring-1 ring-black/10 disabled:opacity-30"
                            aria-label={copy.compareBack}
                          >
                            <ChevronRight className="h-4 w-4" />
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => openItem(item)}
                          className="absolute -bottom-3 right-2 z-10 inline-flex h-8 items-center gap-1 rounded-full bg-white px-2.5 text-[11px] font-semibold text-neutral-800 shadow-sm ring-1 ring-black/10"
                          aria-label={copy.viewSheet}
                        >
                          <Info className="h-3.5 w-3.5" />
                          <span>{copy.viewSheet}</span>
                        </button>
                      </div>
                      <button type="button" onClick={() => openItem(item)} className="block w-full text-left">
                        <div className="space-y-1 px-4 pb-3 pt-5">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
                            {item.brand} · {labelProductType(locale, item.productType)}
                          </p>
                          <p className="font-display text-lg font-semibold leading-snug">{item.name}</p>
                          <p className="text-[11px] text-neutral-500">{item.colour}</p>
                          <p className="font-mono text-[10px] text-neutral-400">{activeRef(item, age) || '—'}</p>
                          <p className="pt-1 font-display text-2xl font-semibold tabular-nums">
                            {euro(price)}
                            <span className="ml-1 text-[10px] font-medium text-neutral-400">{copy.vatIncluded}</span>
                          </p>
                        </div>
                      </button>
                      <div className="flex items-start justify-between gap-2 px-4 pb-3">
                        <AgeFeePicker
                          item={item}
                          age={age}
                          fee={line.fee}
                          fees={fees}
                          copy={copy}
                          onAge={(next) => patchPackLine(index, { age: next })}
                          onFee={(next) => patchPackLine(index, { fee: next })}
                        />
                        <button type="button" onClick={() => setPack((current) => current.filter((_, i) => i !== index))} className="p-1 text-neutral-400 hover:text-red-600" aria-label={copy.removePack}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="flex items-center justify-between gap-2 px-4 pb-4">
                        <span className="text-[11px] text-neutral-400">{copy.colStamp}</span>
                        <input
                          inputMode="decimal"
                          placeholder="0,00"
                          value={line.stampInput}
                          onChange={(event) => {
                            const raw = event.target.value;
                            setPack((current) => current.map((row, i) => (
                              i === index ? { ...row, stampInput: raw, stamp: moneyFromInput(raw) ?? 0 } : row
                            )));
                          }}
                          className="h-9 w-24 rounded-lg border border-neutral-200 px-2 text-right text-sm tabular-nums outline-none"
                          aria-label={copy.stampAria}
                        />
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-neutral-200">
                <table className="min-w-[980px] w-full text-left text-sm">
                  <thead className="bg-neutral-50 text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
                    <tr>
                      <th className="px-3 py-2 font-semibold">#</th>
                      <th className="px-3 py-2 font-semibold">{copy.colProduct}</th>
                      <th className="px-3 py-2 font-semibold">{copy.colAdultRef}</th>
                      <th className="px-3 py-2 font-semibold">{copy.colYouthRef}</th>
                      <th className="px-3 py-2 font-semibold">{copy.colClubFee}</th>
                      <th className="px-3 py-2 font-semibold text-right">{copy.colClubPrice}</th>
                      <th className="px-3 py-2 font-semibold text-right">{copy.colStamp}</th>
                      <th className="px-3 py-2 font-semibold text-right">{copy.colOutside}</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {pack.map((line, index) => {
                      const item = byId.get(line.id);
                      if (!item) return null;
                      const age = lineAge(line);
                      const price = sellPrice(item, channel, line.fee, age);
                      return (
                        <tr key={`${line.id}-${line.fee}-${age}`} className="bg-white align-top">
                          <td className="px-3 py-3">
                            <div className="flex flex-col items-center gap-1">
                              <button
                                type="button"
                                disabled={index === 0}
                                onClick={() => movePackLine(index, -1)}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 text-neutral-600 hover:bg-neutral-50 disabled:opacity-30"
                                aria-label={copy.compareForward}
                              >
                                <ChevronUp className="h-3.5 w-3.5" />
                              </button>
                              <span className="text-[11px] tabular-nums text-neutral-400">{index + 1}</span>
                              <button
                                type="button"
                                disabled={index === pack.length - 1}
                                onClick={() => movePackLine(index, 1)}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 text-neutral-600 hover:bg-neutral-50 disabled:opacity-30"
                                aria-label={copy.compareBack}
                              >
                                <ChevronDown className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex gap-3">
                              <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-neutral-100 bg-white sm:h-28 sm:w-28">
                                <TarifasPhoto src={item.image} alt={item.name} className="h-full w-full p-1.5" onOpen={item.image ? openPhoto : undefined} />
                              </div>
                              <div className="min-w-0">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-400">{labelProductType(locale, item.productType)}</p>
                                <button type="button" onClick={() => openItem(item)} className="text-left font-semibold leading-snug hover:underline">
                                  {item.name}
                                </button>
                                <p className="text-[11px] text-neutral-500">{item.colour}</p>
                                {item.outlet ? <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-800">{copy.outletBadge}</p> : null}
                              </div>
                            </div>
                          </td>
                          <td className={`px-3 py-3 font-mono text-[11px] ${age === 'adult' ? 'font-semibold text-neutral-900' : 'text-neutral-300'}`}>{item.adultRef || '—'}</td>
                          <td className={`px-3 py-3 font-mono text-[11px] ${age === 'youth' ? 'font-semibold text-neutral-900' : 'text-neutral-300'}`}>{item.youthRef || '—'}</td>
                          <td className="px-3 py-3">
                            <AgeFeePicker
                              item={item}
                              age={age}
                              fee={line.fee}
                              fees={fees}
                              copy={copy}
                              onAge={(next) => patchPackLine(index, { age: next })}
                              onFee={(next) => patchPackLine(index, { fee: next })}
                            />
                          </td>
                          <td className="px-3 py-3 text-right font-semibold tabular-nums">
                            {euro(price)}
                            <span className="mt-0.5 block text-[10px] font-medium text-neutral-400">{copy.vatIncluded}</span>
                          </td>
                          <td className="px-3 py-3 text-right">
                            <input
                              inputMode="decimal"
                              placeholder="0,00"
                              value={line.stampInput}
                              onChange={(e) => {
                                const raw = e.target.value;
                                setPack((current) => current.map((row, i) => (
                                  i === index ? { ...row, stampInput: raw, stamp: moneyFromInput(raw) ?? 0 } : row
                                )));
                              }}
                              className="h-9 w-24 rounded-lg border border-neutral-200 px-2 text-right text-sm tabular-nums outline-none"
                              aria-label={copy.stampAria}
                            />
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums text-neutral-500">{euro(fueraPackPrice(item, channel))}</td>
                          <td className="px-3 py-3">
                            <button type="button" onClick={() => setPack((current) => current.filter((_, i) => i !== index))} className="p-1 text-neutral-400 hover:text-red-600" aria-label={copy.removePack}>
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="rounded-2xl border border-neutral-200 bg-white p-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
                {packName.trim() || copy.totalPack}
                {packSeason.trim() ? ` · ${packSeason.trim()}` : ''}
                {' · '}{channel.toUpperCase()}
              </p>
              <p className="mt-2 font-display text-4xl font-semibold tabular-nums">
                {euro(totals.sale)}
                <span className="ml-2 text-sm font-medium text-neutral-400">{copy.vatIncluded}</span>
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
                <div>
                  <p className="text-[11px] text-neutral-400">{copy.clubPrice}</p>
                  <p className="font-semibold tabular-nums">{euro(totals.club)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-neutral-400">{copy.stamping}</p>
                  <p className="font-semibold tabular-nums">{euro(totals.stamp)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-neutral-400">{copy.outsidePack}</p>
                  <p className="font-semibold tabular-nums">{euro(totals.fuera)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-neutral-400">PVP</p>
                  <p className="font-semibold tabular-nums">{euro(totals.rrp)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-neutral-400">{copy.margin}</p>
                  <p className="font-semibold tabular-nums">{pct(totals.margin)}</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                {filledPacks.length >= 2 ? (
                  <button
                    type="button"
                    onClick={() => { setPackCompareOpen(true); setCompareOpen(false); setOpen(null); setDraft(null); }}
                    className="inline-flex h-10 items-center gap-2 rounded-full border border-neutral-200 px-4 text-xs font-semibold"
                  >
                    <Columns2 className="h-4 w-4" /> {copy.comparePacks}
                  </button>
                ) : null}
                {pack.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={Boolean(packExporting)}
                      onClick={() => void downloadPack('xlsx')}
                      className="inline-flex h-10 items-center gap-2 rounded-full bg-neutral-900 px-4 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      <FileSpreadsheet className="h-4 w-4" /> {packExporting === 'xlsx' ? copy.exportingPack : copy.exportPackExcel}
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(packExporting)}
                      onClick={() => void downloadPack('pptx')}
                      className="inline-flex h-10 items-center gap-2 rounded-full border border-neutral-200 px-4 text-xs font-semibold disabled:opacity-50"
                    >
                      <Presentation className="h-4 w-4" /> {packExporting === 'pptx' ? copy.exportingPack : copy.exportPackPpt}
                    </button>
                  </div>
                ) : null}
                {pack.length > 0 ? (
                  <button type="button" onClick={() => setPack([])} className="text-xs font-semibold text-neutral-500">{copy.clearPack}</button>
                ) : null}
                {pack.length > 0 ? (
                  <button type="button" onClick={() => setTab('reservas')} className="text-xs font-semibold text-neutral-700">{copy.reservasFromPack}</button>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </div>

      {shopTab && !compareOpen && !packCompareOpen && !quoteOpen ? (
        <div className="z-40 max-md:fixed max-md:inset-x-3 max-md:bottom-[max(0.75rem,env(safe-area-inset-bottom))] max-md:flex max-md:items-end max-md:gap-2 md:contents">
          {compare.length > 0 ? (
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-2 shadow-lg md:fixed md:bottom-5 md:left-5 md:max-w-[min(100%-2.5rem,42rem)]">
              <Columns2 className="h-4 w-4 shrink-0 text-neutral-500" />
              <div className="flex min-w-0 items-center gap-2">
                {compareItems.map((item) => (
                  <span key={item.id} className="h-8 w-8 shrink-0 overflow-hidden rounded-md bg-neutral-50">
                    <TarifasPhoto src={item.image} alt={item.name} className="h-full w-full p-0.5" />
                  </span>
                ))}
                {compare.length < 2 ? <span className="hidden text-xs text-neutral-400 min-[420px]:inline">{copy.compareHint}</span> : (
                  <span className="hidden truncate text-xs font-semibold text-neutral-500 sm:block">{compare.length}/{COMPARE_MAX}</span>
                )}
              </div>
              {compare.length >= 2 ? (
                <button type="button" onClick={() => { setCompareOpen(true); setOpen(null); setDraft(null); }} className="h-9 shrink-0 rounded-full bg-neutral-900 px-3 text-[11px] font-semibold text-white">
                  {copy.compareView}
                </button>
              ) : null}
              <button type="button" onClick={() => { setCompare([]); setCompareOpen(false); }} className="shrink-0 text-[11px] font-semibold text-neutral-500">
                {copy.compareClear}
              </button>
            </div>
          ) : null}
          {inOutlet ? (
            <button
              type="button"
              onClick={() => setQuoteOpen(true)}
              className="inline-flex shrink-0 items-center gap-2 rounded-full bg-neutral-900 px-4 py-3 text-sm font-semibold text-white shadow-lg max-md:ml-auto md:fixed md:bottom-5 md:right-5"
            >
              <ShoppingBag className="h-4 w-4" />
              {copy.outletPick}
              {outletQuote.length > 0 ? <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-neutral-900">{outletQuote.length}</span> : null}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="inline-flex shrink-0 items-center gap-2 rounded-full bg-neutral-900 px-4 py-3 text-sm font-semibold text-white shadow-lg max-md:ml-auto md:fixed md:bottom-5 md:right-5"
            >
              <ShoppingBag className="h-4 w-4" />
              {copy.pack}
              {pack.length > 0 ? <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-neutral-900">{pack.length}</span> : null}
            </button>
          )}
        </div>
      ) : null}

      {cartOpen ? (
        <div className="fixed inset-0 z-50">
          <button type="button" className="absolute inset-0 bg-neutral-900/30" aria-label={copy.close} onClick={() => setCartOpen(false)} />
          <aside className="absolute inset-y-0 right-0 flex h-[100dvh] w-full max-w-md flex-col bg-white pb-[env(safe-area-inset-bottom)] shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
                  {packSeason.trim() ? `${copy.pack} · ${packSeason.trim()}` : copy.pack}
                </p>
                <h3 className="font-display text-2xl font-semibold">{packName.trim() || copy.cartTitle}</h3>
                {packs.length > 1 ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {packs.map((item, index) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setActivePack(index)}
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          index === activePack ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600'
                        }`}
                      >
                        {packDraftLabel(item, copy.pack, index)}
                        {item.lines.length ? ` · ${item.lines.length}` : ''}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <button type="button" onClick={() => setCartOpen(false)} className="rounded-md p-1 text-neutral-400" aria-label={copy.close}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto">
              {pack.length === 0 ? (
                <p className="px-5 py-12 text-sm text-neutral-400">{copy.emptyPack}</p>
              ) : (
                <ul className="divide-y divide-neutral-100">
                  {pack.map((line, index) => {
                    const item = byId.get(line.id);
                    if (!item) return null;
                    const age = lineAge(line);
                    return (
                      <li key={`${line.id}-${line.fee}-${age}`} className="flex gap-3 px-5 py-3">
                        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-neutral-50">
                          <TarifasPhoto src={item.image} alt={item.name} className="h-full w-full p-1" onOpen={item.image ? openPhoto : undefined} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-400">{labelProductType(locale, item.productType)}</p>
                          <p className="truncate text-sm font-semibold">{item.name}</p>
                          <p className="text-[11px] text-neutral-500">{item.colour}{item.outlet ? ` · ${copy.outletBadge}` : ''}</p>
                          <p className="mt-1 font-mono text-[10px] text-neutral-500">{activeRef(item, age) || '—'}</p>
                          <div className="mt-2">
                            <AgeFeePicker
                              item={item}
                              age={age}
                              fee={line.fee}
                              fees={fees}
                              copy={copy}
                              onAge={(next) => patchPackLine(index, { age: next })}
                              onFee={(next) => patchPackLine(index, { fee: next })}
                            />
                          </div>
                          <p className="mt-2 text-sm font-semibold tabular-nums">
                            {euro(sellPrice(item, channel, line.fee, age))}
                            <span className="ml-1 text-[10px] font-medium text-neutral-400">{copy.vatIncluded}</span>
                          </p>
                        </div>
                        <div className="flex flex-col items-center gap-1 self-start">
                          <button
                            type="button"
                            disabled={index === 0}
                            onClick={() => movePackLine(index, -1)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 text-neutral-600 hover:bg-neutral-50 disabled:opacity-30"
                            aria-label={copy.compareForward}
                          >
                            <ChevronUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={index === pack.length - 1}
                            onClick={() => movePackLine(index, 1)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 text-neutral-600 hover:bg-neutral-50 disabled:opacity-30"
                            aria-label={copy.compareBack}
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" onClick={() => setPack((current) => current.filter((_, i) => i !== index))} className="p-1 text-neutral-400 hover:text-red-600" aria-label={copy.removePack}>
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="border-t border-neutral-100 px-5 py-4">
              <p className="font-display text-3xl font-semibold tabular-nums">
                {euro(totals.sale)}
                <span className="ml-2 text-sm font-medium text-neutral-400">{copy.vatIncluded}</span>
              </p>
              <p className="mt-1 text-[11px] text-neutral-400">{copy.outsidePack} {euro(totals.fuera)} · {copy.margin} {pct(totals.margin)}</p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => { setCartOpen(false); setTab('pack'); }}
                  className="inline-flex h-11 flex-1 items-center justify-center rounded-full bg-neutral-900 text-sm font-semibold text-white"
                >
                  {copy.goToPack}
                </button>
                {pack.length > 0 ? (
                  <button type="button" onClick={() => setPack([])} className="h-11 rounded-full px-3 text-xs font-semibold text-neutral-500">{copy.clearPack}</button>
                ) : null}
              </div>
            </div>
          </aside>
        </div>
      ) : null}

      {quoteOpen ? (
        <div className="fixed inset-0 z-50">
          <button type="button" className="absolute inset-0 bg-neutral-900/30" aria-label={copy.close} onClick={() => setQuoteOpen(false)} />
          <aside className="absolute inset-y-0 right-0 flex h-[100dvh] w-full max-w-md flex-col bg-white pb-[env(safe-area-inset-bottom)] shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">{copy.outlet}</p>
                <h3 className="font-display text-2xl font-semibold">{copy.outletPickTitle}</h3>
              </div>
              <button type="button" onClick={() => setQuoteOpen(false)} className="rounded-md p-1 text-neutral-400" aria-label={copy.close}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto">
              {outletQuote.length === 0 ? (
                <p className="px-5 py-12 text-sm text-neutral-400">{copy.emptyOutletPick}</p>
              ) : (
                <ul className="divide-y divide-neutral-100">
                  {outletQuote.map((line) => {
                    const item = byId.get(line.id);
                    if (!item) return null;
                    return (
                      <li key={line.id} className="space-y-3 px-5 py-4">
                        <div className="flex gap-3">
                          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-neutral-50">
                            <TarifasPhoto src={item.image} alt={item.name} className="h-full w-full p-1" onOpen={item.image ? openPhoto : undefined} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-400">{labelProductType(locale, item.productType)}</p>
                            <p className="truncate text-sm font-semibold">{item.name}</p>
                            <p className="text-[11px] text-neutral-500">{item.colour}</p>
                            <p className="mt-1 font-mono text-[10px] text-neutral-500">{activeRef(item, lineAge(line)) || '—'}</p>
                          </div>
                          <button type="button" onClick={() => setOutletQuote((current) => current.filter((row) => row.id !== line.id))} className="p-1 text-neutral-400 hover:text-red-600" aria-label={copy.removePack}>
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        <OutletPriceControl
                          item={item}
                          line={line}
                          copy={copy}
                          euro={euro}
                          pct={pct}
                          onChange={(next) => writeOutletLine(item, next)}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="border-t border-neutral-100 px-5 py-4">
              <p className="font-display text-3xl font-semibold tabular-nums">
                {euro(quoteTotals.sale)}
                <span className="ml-2 text-sm font-medium text-neutral-400">{copy.vatIncluded}</span>
              </p>
              <p className={`mt-1 text-[11px] ${marginTone(quoteTotals.margin)}`}>
                {copy.cost} {euro(quoteTotals.cost)} · {copy.margin} {pct(quoteTotals.margin)}
              </p>
              <div className="mt-3 flex gap-2">
                {outletQuote.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => void downloadOutletQuote()}
                    className="inline-flex h-11 flex-1 items-center justify-center rounded-full bg-neutral-900 text-sm font-semibold text-white"
                  >
                    {copy.exportOutlet}
                  </button>
                ) : null}
                {outletQuote.length > 0 ? (
                  <button type="button" onClick={() => setOutletQuote([])} className="h-11 rounded-full px-3 text-xs font-semibold text-neutral-500">{copy.clearOutlet}</button>
                ) : null}
              </div>
            </div>
          </aside>
        </div>
      ) : null}

      {open && draft ? (
        <div className="abonos-modal-backdrop" onClick={() => { setOpen(null); setDraft(null); }}>
          <div
            className="abonos-modal overflow-hidden bg-white"
            style={{ width: 'min(920px, 100%)' }}
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="grid md:grid-cols-2">
              <div className="bg-neutral-50 p-4 sm:p-6">
                <TarifasPhoto
                  key={draft.image || draft.id}
                  src={draft.image}
                  alt={draft.name}
                  className="mx-auto max-h-[38vh] w-full md:max-h-[520px]"
                  onOpen={draft.image ? openPhoto : undefined}
                />
              </div>
              <div className="flex flex-col p-4 sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
                      {draft.brand} · {labelProductType(locale, draft.productType)} · {copy.kinds[kindOf(draft)]}
                    </p>
                    <h3 className="mt-1 font-display text-2xl font-semibold tracking-tight">{draft.name || copy.newRef}</h3>
                    <p className="mt-1 text-sm text-neutral-500">{draft.colour}</p>
                    {draft.outlet ? <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-800">{copy.outletBadge}</p> : null}
                  </div>
                  <button type="button" onClick={() => { setOpen(null); setDraft(null); }} className="rounded-md p-1 text-neutral-400" aria-label={copy.close}>
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {!editing ? (
                  <>
                    <div className="mt-4">
                      {ageKind(draft) === 'youthOnly' ? (
                        <AgeChip tone="youth">{copy.youthOnly}</AgeChip>
                      ) : ageKind(draft) === 'both' ? (
                        <AgeChip tone="adult">{copy.adultAndYouth}</AgeChip>
                      ) : (
                        <AgeChip tone="adult">{copy.adultOnly}</AgeChip>
                      )}
                      <div className="mt-2 space-y-1">
                        {draft.adultRef ? (
                          <p className="font-mono text-sm text-neutral-700">
                            <span className="mr-2 font-sans text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">{copy.colAdultRef}</span>
                            {draft.adultRef}
                          </p>
                        ) : null}
                        {draft.youthRef ? (
                          <p className="font-mono text-sm text-neutral-700">
                            <span className="mr-2 font-sans text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">{copy.colYouthRef}</span>
                            {draft.youthRef}
                          </p>
                        ) : null}
                        {!draft.adultRef && !draft.youthRef ? <p className="font-mono text-sm text-neutral-400">—</p> : null}
                      </div>
                    </div>
                    {draft.red ? (
                      <p className={`mt-1 text-[11px] ${isExpired(draft.red) ? 'font-semibold text-neutral-900' : 'text-neutral-400'}`}>
                        {copy.validity} {formatRed(draft.red)}
                      </p>
                    ) : null}

                    <p className="mt-4 text-[11px] uppercase tracking-[0.12em] text-neutral-400">{inOutlet ? copy.yourPrice : `${copy.atPrice} · ${channel.toUpperCase()}`}</p>
                    {inOutlet ? (
                      <div className="mt-2 space-y-3 rounded-xl border border-neutral-200 p-3">
                        <p className="text-[11px] text-neutral-400">PVP {euro(rrpPrice(draft, 'b2c', outletLineOf(draft).age))}</p>
                        <OutletPriceControl
                          item={draft}
                          line={outletLineOf(draft)}
                          copy={copy}
                          euro={euro}
                          pct={pct}
                          onChange={(next) => writeOutletLine(draft, next)}
                        />
                      </div>
                    ) : (
                    <div className="mt-2 overflow-hidden rounded-xl border border-neutral-200">
                      <table className="w-full text-sm">
                        <tbody>
                          {ageKind(draft) !== 'youthOnly' ? (
                            <tr className="border-b border-neutral-100">
                              <td className="px-3 py-2 text-neutral-500">PVP{hasYouth(draft) ? ` ${copy.adult}` : ''}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{euro(rrpPrice(draft, channel, 'adult'))}</td>
                            </tr>
                          ) : null}
                          {hasYouth(draft) ? (
                            <tr className="border-b border-neutral-100">
                              <td className="px-3 py-2 text-neutral-500">PVP {copy.youth}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{euro(rrpPrice(draft, channel, 'youth'))}</td>
                            </tr>
                          ) : null}
                          {fees.map((level) => (
                            <tr key={level} className="border-b border-neutral-100 last:border-0">
                              <td className="px-3 py-2 text-neutral-500">Fee {level}</td>
                              <td className="px-3 py-2 text-right font-semibold tabular-nums">{euro(sellPrice(draft, channel, level, ageKind(draft) === 'youthOnly' ? 'youth' : 'adult'))}</td>
                            </tr>
                          ))}
                          <tr>
                            <td className="px-3 py-2 text-[11px] text-neutral-400">{copy.marginFee} {fee}</td>
                            <td className="px-3 py-2 text-right text-[11px] tabular-nums text-neutral-400">{pct(lineMargin(draft, channel, fee, ageKind(draft) === 'youthOnly' ? 'youth' : 'adult'))}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    )}
                    {colourways(products, draft).length > 1 ? (
                      <div className="mt-4">
                        <p className="text-[11px] uppercase tracking-[0.12em] text-neutral-400">{copy.colours}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {colourways(products, draft).map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => openItem(item)}
                              className={`rounded-lg border px-2 py-1 text-[11px] ${item.id === draft.id ? 'border-neutral-900' : 'border-neutral-200'}`}
                            >
                              {item.colour}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <div className="mt-6 space-y-3">
                      {!inOutlet ? (
                        <div>
                          <p className="mb-1.5 text-[11px] uppercase tracking-[0.12em] text-neutral-400">{copy.addToPack}</p>
                          <AgeFeePicker
                            item={draft}
                            age={sheetAge}
                            fee={fee}
                            fees={fees}
                            copy={copy}
                            onAge={setSheetAge}
                            onFee={setFee}
                          />
                          <p className="mt-2 font-mono text-[11px] text-neutral-500">{activeRef(draft, sheetAge) || '—'}</p>
                          <p className="mt-1 text-sm font-semibold tabular-nums">
                            {euro(sellPrice(draft, channel, fee, sheetAge))}
                            <span className="ml-1 text-[10px] font-medium text-neutral-400">{copy.vatIncluded}</span>
                          </p>
                        </div>
                      ) : null}
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => toggleCompare(draft.id)}
                          className={`inline-flex h-11 items-center justify-center gap-2 rounded-full border px-4 text-sm font-semibold ${
                            compare.includes(draft.id) ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 text-neutral-700'
                          }`}
                        >
                          <Columns2 className="h-4 w-4" /> {compare.includes(draft.id) ? copy.compareOn : copy.compare}
                        </button>
                        {inOutlet ? (
                          <button
                            type="button"
                            onClick={() => {
                              const next = outletLineOf(draft);
                              writeOutletLine(draft, next);
                              setOutletQuote((current) => (
                                current.some((line) => line.id === draft.id) ? current : [...current, next]
                              ));
                              setOpen(null);
                              setDraft(null);
                            }}
                            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-neutral-900 text-sm font-semibold text-white"
                          >
                            <Plus className="h-4 w-4" /> {outletQuote.some((line) => line.id === draft.id) ? copy.chosenOutlet : copy.chooseOutlet}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => { addToPack(draft, fee, sheetAge); setOpen(null); setDraft(null); }}
                            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-neutral-900 text-sm font-semibold text-white"
                          >
                            <Plus className="h-4 w-4" /> {copy.addToPack}
                          </button>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="mt-4 grid max-h-[70vh] grid-cols-1 gap-2 overflow-auto pr-1 sm:grid-cols-2">
                    <p className="col-span-full mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">{copy.sectionProduct}</p>
                    <Field label={copy.fieldBrand}><input className={inputClass} value={draft.brand} onChange={(e) => setDraft({ ...draft, brand: e.target.value })} /></Field>
                    <Field label={copy.fieldType}><input className={inputClass} value={draft.productType} onChange={(e) => setDraft({ ...draft, productType: e.target.value })} /></Field>
                    <div className="col-span-full">
                      <Field label={copy.fieldName}><input className={inputClass} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
                    </div>
                    <Field label={copy.fieldColour}><input className={inputClass} value={draft.colour} onChange={(e) => setDraft({ ...draft, colour: e.target.value })} /></Field>
                    <Field label={copy.fieldImage}><input className={inputClass} value={draft.image || ''} onChange={(e) => setDraft({ ...draft, image: e.target.value || null })} /></Field>
                    <Field label={copy.fieldAdultRef}><input className={inputClass} value={draft.adultRef} onChange={(e) => setDraft({ ...draft, adultRef: e.target.value, id: e.target.value || draft.id })} /></Field>
                    <Field label={copy.fieldYouthRef}><input className={inputClass} value={draft.youthRef} onChange={(e) => setDraft({ ...draft, youthRef: e.target.value })} /></Field>
                    <Field label={copy.fieldSport}>
                      <select className={inputClass} value={draft.sport} onChange={(e) => setDraft({ ...draft, sport: e.target.value as TarifaSport })}>
                        {SPORTS.map((item) => <option key={item} value={item}>{copy.sports[item]}</option>)}
                      </select>
                    </Field>
                    <Field label={copy.fieldGender}>
                      <select className={inputClass} value={draft.gender} onChange={(e) => setDraft({ ...draft, gender: e.target.value as TarifaGender })}>
                        {GENDERS.map((item) => <option key={item} value={item}>{copy.genders[item]}</option>)}
                      </select>
                    </Field>
                    <Field label={copy.fieldKind}>
                      <select className={inputClass} value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as TarifaKind })}>
                        {KINDS.map((item) => <option key={item} value={item}>{copy.kinds[item]}</option>)}
                      </select>
                    </Field>
                    <Field label={copy.fieldNovelty}>
                      <select className={inputClass} value={draft.novelty} onChange={(e) => setDraft({ ...draft, novelty: e.target.value as TarifaNovelty | '' })}>
                        <option value="">{copy.fieldNone}</option>
                        {NOVELTIES.map((item) => <option key={item} value={item}>{copy.novelties[item]}</option>)}
                      </select>
                    </Field>
                    <Field label={copy.fieldCollection}><input className={inputClass} value={draft.collection} onChange={(e) => setDraft({ ...draft, collection: e.target.value })} /></Field>
                    <Field label={copy.fieldSeason}><input className={inputClass} value={draft.season} onChange={(e) => setDraft({ ...draft, season: e.target.value })} /></Field>
                    <Field label={copy.fieldRed}><input className={inputClass} type="date" value={draft.red || ''} onChange={(e) => setDraft({ ...draft, red: e.target.value || null })} /></Field>
                    {draft.outlet ? (
                      <>
                        <p className="col-span-full mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">{copy.outlet}</p>
                        <Field label={copy.fieldCostAdult}><input className={inputClass} value={draft.b2c.adultNet ?? ''} onChange={(e) => setDraft({ ...draft, b2c: { ...draft.b2c, adultNet: moneyFromInput(e.target.value) } })} /></Field>
                        <Field label={copy.fieldCostYouth}><input className={inputClass} value={draft.b2c.youthNet ?? ''} onChange={(e) => setDraft({ ...draft, b2c: { ...draft.b2c, youthNet: moneyFromInput(e.target.value) } })} /></Field>
                        <Field label={copy.fieldPvpAdult}><input className={inputClass} value={draft.b2c.adultRrp ?? ''} onChange={(e) => setDraft({ ...draft, b2c: { ...draft.b2c, adultRrp: moneyFromInput(e.target.value) } })} /></Field>
                        <Field label={copy.fieldPvpYouth}><input className={inputClass} value={draft.b2c.youthRrp ?? ''} onChange={(e) => setDraft({ ...draft, b2c: { ...draft.b2c, youthRrp: moneyFromInput(e.target.value) } })} /></Field>
                      </>
                    ) : (
                      <>
                        <p className="col-span-full mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">{copy.sectionB2c}</p>
                        <Field label="B2C PVP adulto"><input className={inputClass} value={draft.b2c.adultRrp ?? ''} onChange={(e) => setDraft({ ...draft, b2c: { ...draft.b2c, adultRrp: moneyFromInput(e.target.value) } })} /></Field>
                        <Field label="B2C PVP niño"><input className={inputClass} value={draft.b2c.youthRrp ?? ''} onChange={(e) => setDraft({ ...draft, b2c: { ...draft.b2c, youthRrp: moneyFromInput(e.target.value) } })} /></Field>
                        <Field label="B2C Fee 1"><input className={inputClass} value={draft.b2c.fee1 ?? ''} onChange={(e) => setDraft({ ...draft, b2c: { ...draft.b2c, fee1: moneyFromInput(e.target.value) } })} /></Field>
                        <Field label="B2C Fee 2"><input className={inputClass} value={draft.b2c.fee2 ?? ''} onChange={(e) => setDraft({ ...draft, b2c: { ...draft.b2c, fee2: moneyFromInput(e.target.value) } })} /></Field>
                        <Field label="B2C Fee 3"><input className={inputClass} value={draft.b2c.fee3 ?? ''} onChange={(e) => setDraft({ ...draft, b2c: { ...draft.b2c, fee3: moneyFromInput(e.target.value) } })} /></Field>
                        <Field label="B2C Fee 4"><input className={inputClass} value={draft.b2c.fee4 ?? ''} onChange={(e) => setDraft({ ...draft, b2c: { ...draft.b2c, fee4: moneyFromInput(e.target.value) } })} /></Field>
                        <Field label="B2C Neto adulto"><input className={inputClass} value={draft.b2c.adultNet ?? ''} onChange={(e) => setDraft({ ...draft, b2c: { ...draft.b2c, adultNet: moneyFromInput(e.target.value) } })} /></Field>
                        <Field label="B2C Neto niño"><input className={inputClass} value={draft.b2c.youthNet ?? ''} onChange={(e) => setDraft({ ...draft, b2c: { ...draft.b2c, youthNet: moneyFromInput(e.target.value) } })} /></Field>
                        <p className="col-span-full mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">{copy.sectionB2b}</p>
                        <Field label="B2B PVP adulto"><input className={inputClass} value={draft.b2b.adultRrp ?? ''} onChange={(e) => setDraft({ ...draft, b2b: { ...draft.b2b, adultRrp: moneyFromInput(e.target.value) } })} /></Field>
                        <Field label="B2B PVP niño"><input className={inputClass} value={draft.b2b.youthRrp ?? ''} onChange={(e) => setDraft({ ...draft, b2b: { ...draft.b2b, youthRrp: moneyFromInput(e.target.value) } })} /></Field>
                        <Field label="B2B Fee 1 adulto"><input className={inputClass} value={draft.b2b.adultFee1 ?? ''} onChange={(e) => setDraft({ ...draft, b2b: { ...draft.b2b, adultFee1: moneyFromInput(e.target.value) } })} /></Field>
                        <Field label="B2B Fee 1 niño"><input className={inputClass} value={draft.b2b.youthFee1 ?? ''} onChange={(e) => setDraft({ ...draft, b2b: { ...draft.b2b, youthFee1: moneyFromInput(e.target.value) } })} /></Field>
                        <Field label="B2B Fee 2 adulto"><input className={inputClass} value={draft.b2b.adultFee2 ?? ''} onChange={(e) => setDraft({ ...draft, b2b: { ...draft.b2b, adultFee2: moneyFromInput(e.target.value) } })} /></Field>
                        <Field label="B2B Fee 2 niño"><input className={inputClass} value={draft.b2b.youthFee2 ?? ''} onChange={(e) => setDraft({ ...draft, b2b: { ...draft.b2b, youthFee2: moneyFromInput(e.target.value) } })} /></Field>
                        <Field label="B2B Fee 3 adulto"><input className={inputClass} value={draft.b2b.adultFee3 ?? ''} onChange={(e) => setDraft({ ...draft, b2b: { ...draft.b2b, adultFee3: moneyFromInput(e.target.value) } })} /></Field>
                        <Field label="B2B Fee 3 niño"><input className={inputClass} value={draft.b2b.youthFee3 ?? ''} onChange={(e) => setDraft({ ...draft, b2b: { ...draft.b2b, youthFee3: moneyFromInput(e.target.value) } })} /></Field>
                        <Field label="B2B Neto adulto"><input className={inputClass} value={draft.b2b.adultNet ?? ''} onChange={(e) => setDraft({ ...draft, b2b: { ...draft.b2b, adultNet: moneyFromInput(e.target.value) } })} /></Field>
                        <Field label="B2B Neto niño"><input className={inputClass} value={draft.b2b.youthNet ?? ''} onChange={(e) => setDraft({ ...draft, b2b: { ...draft.b2b, youthNet: moneyFromInput(e.target.value) } })} /></Field>
                      </>
                    )}
                    <div className="col-span-2 mt-2 flex gap-2">
                      <button type="button" onClick={saveDraft} className="inline-flex h-11 flex-1 items-center justify-center rounded-full bg-neutral-900 text-sm font-semibold text-white">
                        {copy.saveRef}
                      </button>
                      {products.some((item) => item.id === draft.id) ? (
                        <button
                          type="button"
                          onClick={async () => {
                            await persist(products.filter((item) => item.id !== draft.id));
                            setOpen(null);
                            setDraft(null);
                          }}
                          className="h-11 rounded-full border border-neutral-200 px-4 text-xs font-semibold text-red-600"
                        >
                          {copy.removeRef}
                        </button>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {packCompareOpen && filledPacks.length >= 2 && channel ? (
        <div className="abonos-modal-backdrop" onClick={() => setPackCompareOpen(false)}>
          <div
            className="abonos-modal overflow-hidden bg-white"
            style={{ width: filledPacks.length > 2 ? 'min(1180px, 100%)' : 'min(920px, 100%)' }}
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-neutral-100 px-4 py-3 sm:px-6 sm:py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">{channel.toUpperCase()}</p>
                <h3 className="font-display text-xl font-semibold sm:text-2xl">{copy.comparePacksTitle}</h3>
              </div>
              <button type="button" onClick={() => setPackCompareOpen(false)} className="rounded-md p-1 text-neutral-400" aria-label={copy.close}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[80vh] overflow-auto px-4">
              <CompareSheet
                count={filledPacks.length}
                heads={filledPacks.map((item, index) => {
                  const photos = item.lines.map((line) => byId.get(line.id)).filter((row): row is TarifaProduct => Boolean(row?.image)).slice(0, 4);
                  const packIndex = packs.findIndex((row) => row.id === item.id);
                  return (
                    <div key={item.id} className="min-w-0">
                      <div className="mb-2 flex items-center justify-between">
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() => movePack(item.id, -1)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-neutral-200 text-neutral-600 hover:bg-neutral-50 disabled:opacity-30"
                          aria-label={copy.compareForward}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-400">{index + 1}</span>
                        <button
                          type="button"
                          disabled={index === filledPacks.length - 1}
                          onClick={() => movePack(item.id, 1)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-neutral-200 text-neutral-600 hover:bg-neutral-50 disabled:opacity-30"
                          aria-label={copy.compareBack}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                      <div className={`overflow-hidden rounded-xl bg-neutral-50 ${photos.length > 1 ? 'grid grid-cols-2 gap-1 p-1' : ''}`}>
                        {(photos.length ? photos : [null]).map((product, photoIndex) => (
                          <div key={product?.id || photoIndex} className="aspect-square overflow-hidden">
                            <TarifasPhoto src={product?.image || null} alt={product?.name || item.name} className="h-full w-full p-2" onOpen={product?.image ? openPhoto : undefined} />
                          </div>
                        ))}
                      </div>
                      <p className="mt-3 font-display text-lg font-semibold leading-snug">{packDraftLabel(item, copy.pack, packIndex === -1 ? index : packIndex)}</p>
                      <p className="text-[11px] text-neutral-500">{item.season.trim() || '—'} · {item.lines.length} {copy.packPieces.toLowerCase()}</p>
                    </div>
                  );
                })}
                rows={packCompareRows(filledPacks, products, channel, copy, locale, euro, pct).map((row) => ({
                  section: row.section,
                  label: row.label,
                  values: row.values,
                  differs: row.values.some((value) => value !== row.values[0]),
                }))}
              />
            </div>
          </div>
        </div>
      ) : null}

      {compareOpen && compareItems.length >= 2 && channel ? (
        <div className="abonos-modal-backdrop" onClick={() => setCompareOpen(false)}>
          <div
            className="abonos-modal overflow-hidden bg-white"
            style={{ width: compareItems.length > 2 ? 'min(1180px, 100%)' : 'min(920px, 100%)' }}
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-neutral-100 px-4 py-3 sm:px-6 sm:py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">{channel.toUpperCase()}</p>
                <h3 className="font-display text-xl font-semibold sm:text-2xl">{copy.compareTitle}</h3>
              </div>
              <button type="button" onClick={() => setCompareOpen(false)} className="rounded-md p-1 text-neutral-400" aria-label={copy.close}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[80vh] overflow-auto px-4">
              <CompareSheet
                count={compareItems.length}
                heads={compareItems.map((item, index) => {
                  const tone = rankTone(compareItems.map((row) => sellPrice(row, channel, fee, 'adult')), index);
                  return (
                    <div
                      key={item.id}
                      className={`h-full min-w-0 rounded-2xl p-2 ${
                        tone === 'low' ? 'bg-emerald-50/70 ring-1 ring-emerald-100' : tone === 'high' ? 'bg-rose-50/70 ring-1 ring-rose-100' : ''
                      }`}
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() => moveCompare(item.id, -1)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 disabled:opacity-30"
                          aria-label={copy.compareForward}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-400">{index + 1}</span>
                        <button
                          type="button"
                          disabled={index === compareItems.length - 1}
                          onClick={() => moveCompare(item.id, 1)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 disabled:opacity-30"
                          aria-label={copy.compareBack}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="relative aspect-square overflow-hidden rounded-xl bg-white/80">
                        <TarifasPhoto src={item.image} alt={item.name} className="h-full w-full p-3" onOpen={item.image ? openPhoto : undefined} />
                        <button
                          type="button"
                          onClick={() => { setCompareOpen(false); openItem(item); }}
                          className="absolute bottom-2 right-2 inline-flex h-8 items-center gap-1 rounded-full bg-white px-2.5 text-[11px] font-semibold text-neutral-800 shadow-sm ring-1 ring-black/10"
                          aria-label={copy.viewSheet}
                        >
                          <Info className="h-3.5 w-3.5" />
                          <span>{copy.viewSheet}</span>
                        </button>
                      </div>
                      <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
                        {item.brand} · {labelProductType(locale, item.productType)}
                      </p>
                      <p className="font-display text-lg font-semibold leading-snug">{item.name}</p>
                      <p className="text-[11px] text-neutral-500">{item.colour}</p>
                      <RankBadge tone={tone} copy={copy} />
                      {item.outlet ? <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-800">{copy.outletBadge}</p> : null}
                    </div>
                  );
                })}
                rows={compareRows(compareItems, channel, fees, copy, euro, inOutlet).map((row) => ({
                  section: row.section,
                  label: row.label,
                  values: row.values,
                  tones: row.nums ? row.nums.map((_, index) => rankTone(row.nums || [], index)) : undefined,
                  differs: !row.nums && row.values.some((value) => value !== row.values[0]),
                }))}
              />
            </div>
          </div>
        </div>
      ) : null}

      {zoom ? (
        <PhotoLightbox
          src={zoom.src}
          alt={zoom.alt}
          downloadLabel={copy.downloadPhoto}
          closeLabel={copy.close}
          onClose={() => setZoom(null)}
        />
      ) : null}
    </div>
  );
}
