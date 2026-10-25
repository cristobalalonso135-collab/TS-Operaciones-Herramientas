'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import FileUpload from '@/components/FileUpload';
import WorkspaceChrome from '@/components/WorkspaceChrome';
import catalog from '@/data/tarifas-catalog.json';
import { catalogExportRows, moneyFromInput, packExportRows, parseTarifasSheets } from '@/lib/tarifas-excel';
import {
  GENDERS,
  KINDS,
  NOVELTIES,
  SPORTS,
  ageKind,
  activeRef,
  asProduct,
  channelFees,
  colourways,
  emptyProduct,
  formatEuro,
  formatPct,
  formatRed,
  fueraPackPrice,
  hasYouth,
  isExpired,
  kindOf,
  lineMargin,
  packTotals,
  rrpPrice,
  sellPrice,
  uniqueSorted,
  type FeeLevel,
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
import { ArrowLeft, Download, Lock, Plus, Search, ShoppingBag, Trash2, X } from 'lucide-react';

const ADMIN_KEY = '2627';
const ADMIN_STORAGE = 'ts-tarifas-admin';

const SEED = (catalog as unknown[]).map(asProduct);

function Photo({ src, alt, className }: { src: string | null; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className={`flex items-center justify-center bg-neutral-50 ${className || ''}`}>
        <span className="font-display text-3xl font-semibold tracking-tight text-neutral-300">
          {alt.slice(0, 1).toUpperCase()}
        </span>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`bg-white object-contain object-center ${className || ''}`}
    />
  );
}

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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-400">{label}</span>
      {children}
    </label>
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
    <div className="rounded-2xl border border-neutral-200 bg-white px-3 py-2">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-400">{copy.selectLanguage}</p>
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
  mode: '' | TarifaAgeKind;
  copy: TarifasCopy;
  localeTag: string;
}) {
  const adult = rrpPrice(item, channel, 'adult');
  const youth = rrpPrice(item, channel, 'youth');
  const showAdult = mode !== 'youthOnly';
  const showYouth = hasYouth(item) && mode !== 'adult';
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

export default function TarifasTool({ onBack }: { onBack: () => void }) {
  const [products, setProducts] = useState<TarifaProduct[]>(SEED);
  const [backend, setBackend] = useState<TarifasBackend>('local');
  const [setupSql, setSetupSql] = useState<string>();
  const [status, setStatus] = useState('');
  const [channel, setChannel] = useState<TarifaChannel | null>(null);
  const [tab, setTab] = useState<'catalogo' | 'pack' | 'maestro'>('catalogo');
  const [fee, setFee] = useState<FeeLevel>(1);
  const [query, setQuery] = useState('');
  const [brand, setBrand] = useState('');
  const [type, setType] = useState('');
  const [colour, setColour] = useState('');
  const [sport, setSport] = useState<TarifaSport | ''>('');
  const [gender, setGender] = useState<TarifaGender | ''>('');
  const [kind, setKind] = useState<TarifaKind | ''>('');
  const [novelty, setNovelty] = useState<TarifaNovelty | ''>('');
  const [ageFilter, setAgeFilter] = useState<'' | TarifaAgeKind>('');
  const [sort, setSort] = useState<'nombre' | 'marca' | 'precio' | 'pvp'>('nombre');
  const [open, setOpen] = useState<TarifaProduct | null>(null);
  const [openAge, setOpenAge] = useState<TarifaAge>('adult');
  const [draft, setDraft] = useState<TarifaProduct | null>(null);
  const [pack, setPack] = useState<PackLine[]>([]);
  const [locale, setLocale] = useState<TarifasLocale>('es');
  const [admin, setAdmin] = useState(false);
  const [pin, setPin] = useState('');
  const [askPin, setAskPin] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);

  useEffect(() => {
    setLocale(readTarifasLocale());
    const params = new URLSearchParams(window.location.search);
    const unlocked = params.get('admin') === '1' || window.localStorage.getItem(ADMIN_STORAGE) === '1';
    if (params.get('admin') === '1') window.localStorage.setItem(ADMIN_STORAGE, '1');
    setAdmin(unlocked);
    loadTarifasCatalog(SEED).then((loaded) => {
      setProducts(loaded.products);
      setBackend(loaded.backend);
      setSetupSql(loaded.setupSql);
    });
  }, []);

  useEffect(() => {
    if (!admin && tab === 'maestro') setTab('catalogo');
  }, [admin, tab]);

  const copy = TARIFAS_COPY[locale];
  const localeTag = TARIFAS_LOCALE_TAG[locale];
  const euro = (value: number | null | undefined) => formatEuro(value, localeTag);
  const pct = (value: number | null | undefined) => formatPct(value, localeTag);
  const pickLocale = (next: TarifasLocale) => {
    setLocale(next);
    writeTarifasLocale(next);
  };

  const fees = channel ? channelFees(channel) : [];
  const filtersOn = Boolean(query || brand || type || colour || sport || gender || kind || novelty || ageFilter);

  const facets = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('es');
    const pass = (item: TarifaProduct, skip: string) => {
      if (skip !== 'brand' && brand && item.brand !== brand) return false;
      if (skip !== 'type' && type && item.productType !== type) return false;
      if (skip !== 'colour' && colour && item.colour !== colour) return false;
      if (skip !== 'sport' && sport && item.sport !== sport) return false;
      if (skip !== 'gender' && gender && item.gender !== gender) return false;
      if (skip !== 'kind' && kind && kindOf(item) !== kind) return false;
      if (skip !== 'novelty' && novelty && item.novelty !== novelty) return false;
      if (skip !== 'age' && ageFilter && ageKind(item) !== ageFilter) return false;
      if (skip !== 'query' && q) {
        const hay = `${item.brand} ${item.productType} ${item.name} ${item.colour} ${item.collection} ${item.adultRef} ${item.youthRef}`.toLocaleLowerCase('es');
        if (!hay.includes(q)) return false;
      }
      return true;
    };
    const pool = (skip: string) => products.filter((item) => pass(item, skip));
    const keep = (list: string[], current: string) => (current && !list.includes(current) ? [current, ...list] : list);
    return {
      brands: keep(uniqueSorted(pool('brand'), 'brand'), brand),
      types: keep(uniqueSorted(pool('type'), 'productType'), type),
      colours: keep(uniqueSorted(pool('colour'), 'colour'), colour),
      sports: keep(
        SPORTS.filter((item) => pool('sport').some((row) => row.sport === item)),
        sport,
      ) as TarifaSport[],
      genders: keep(
        GENDERS.filter((item) => pool('gender').some((row) => row.gender === item)),
        gender,
      ) as TarifaGender[],
      kinds: KINDS.filter((item) => item === kind || pool('kind').some((row) => kindOf(row) === item)),
      novelties: NOVELTIES.filter((item) => item === novelty || pool('novelty').some((row) => row.novelty === item)),
      ages: (['both', 'adult', 'youthOnly'] as TarifaAgeKind[]).filter(
        (item) => item === ageFilter || pool('age').some((row) => ageKind(row) === item),
      ),
    };
  }, [ageFilter, brand, colour, gender, kind, novelty, products, query, sport, type]);

  const clearFilters = () => {
    setQuery('');
    setBrand('');
    setType('');
    setColour('');
    setSport('');
    setGender('');
    setKind('');
    setNovelty('');
    setAgeFilter('');
  };

  const filtered = useMemo(() => {
    if (!channel) return [];
    const q = query.trim().toLocaleLowerCase('es');
    const rows = products.filter((item) => {
      if (brand && item.brand !== brand) return false;
      if (type && item.productType !== type) return false;
      if (colour && item.colour !== colour) return false;
      if (sport && item.sport !== sport) return false;
      if (gender && item.gender !== gender) return false;
      if (kind && kindOf(item) !== kind) return false;
      if (novelty && item.novelty !== novelty) return false;
      if (ageFilter && ageKind(item) !== ageFilter) return false;
      if (q) {
        const hay = `${item.brand} ${item.productType} ${item.name} ${item.colour} ${item.collection} ${item.adultRef} ${item.youthRef}`.toLocaleLowerCase('es');
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    return rows.slice().sort((a, b) => {
      if (sort === 'marca') return a.brand.localeCompare(b.brand, 'es') || a.name.localeCompare(b.name, 'es');
      if (sort === 'precio') return (sellPrice(a, channel, fee) ?? 0) - (sellPrice(b, channel, fee) ?? 0);
      if (sort === 'pvp') return (rrpPrice(a, channel) ?? 0) - (rrpPrice(b, channel) ?? 0);
      return a.name.localeCompare(b.name, 'es') || a.colour.localeCompare(b.colour, 'es');
    });
  }, [ageFilter, brand, channel, colour, fee, gender, kind, novelty, products, query, sort, sport, type]);

  const totals = useMemo(
    () => (channel ? packTotals(products, pack, channel) : { pieces: 0, club: 0, stamp: 0, sale: 0, rrp: 0, fuera: 0, margin: null }),
    [channel, pack, products],
  );
  const byId = useMemo(() => new Map(products.map((item) => [item.id, item])), [products]);
  const editing = admin && tab === 'maestro';
  const visibleTabs = admin
    ? [
        { id: 'catalogo', label: copy.catalog },
        { id: 'pack', label: copy.pack },
        { id: 'maestro', label: copy.master },
      ]
    : [
        { id: 'catalogo', label: copy.catalog },
        { id: 'pack', label: copy.pack },
      ];

  const persist = async (next: TarifaProduct[]) => {
    setProducts(next);
    try {
      await saveTarifasCatalog(next, backend);
      setStatus(backend === 'supabase' ? copy.savedNetwork : copy.savedLocal);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : copy.saveError);
    }
  };

  const addToPack = (item: TarifaProduct, chosenFee = fee) => {
    setPack((current) => {
      if (current.some((line) => line.id === item.id && line.fee === chosenFee)) return current;
      return [...current, { id: item.id, fee: chosenFee, stamp: 0, stampInput: '' }];
    });
    setCartOpen(true);
  };

  const tryAdmin = () => {
    if (pin.trim() === ADMIN_KEY) {
      window.localStorage.setItem(ADMIN_STORAGE, '1');
      setAdmin(true);
      setAskPin(false);
      setPin('');
      return;
    }
    setStatus(copy.adminWrong);
  };

  const pickChannel = (next: TarifaChannel) => {
    setChannel(next);
    setFee(1);
    setTab('catalogo');
  };

  const openItem = (item: TarifaProduct) => {
    setOpen(item);
    setOpenAge(ageKind(item) === 'youthOnly' || ageFilter === 'youthOnly' ? 'youth' : 'adult');
    setDraft(asProduct(item));
  };

  const saveDraft = async () => {
    if (!draft) return;
    const next = products.some((item) => item.id === draft.id)
      ? products.map((item) => (item.id === draft.id ? asProduct(draft) : item))
      : [asProduct(draft), ...products];
    await persist(next);
    setOpen(asProduct(draft));
  };

  const downloadCatalog = async () => {
    const XLSX = await import('xlsx');
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(catalogExportRows(products)), 'Tarifas');
    XLSX.writeFile(workbook, 'Tarifas_maestro.xlsx');
  };

  const downloadPack = async () => {
    if (!channel) return;
    const XLSX = await import('xlsx');
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(packExportRows(products, pack, channel, copy.packHeaders, localeTag)), 'Pack');
    XLSX.writeFile(workbook, `Pack_${channel.toUpperCase()}.xlsx`);
  };

  const importSheets = async (sheets: Record<string, unknown[][]>) => {
    const parsed = parseTarifasSheets(sheets);
    if (parsed.length === 0) {
      setStatus(copy.emptyExcel);
      return;
    }
    const photos = new Map<string, string>();
    products.forEach((item) => {
      if (!item.image) return;
      if (item.adultRef) photos.set(item.adultRef, item.image);
      if (item.youthRef) photos.set(item.youthRef, item.image);
    });
    const next = parsed.map((item) => (
      item.image ? item : { ...item, image: photos.get(item.adultRef) || photos.get(item.youthRef) || null }
    ));
    await persist(next);
    setStatus(`${next.length.toLocaleString(localeTag)} ${copy.imported}`);
  };

  if (!channel) {
    return (
      <div className="tarifas-shell -mx-6 -mb-8 min-h-[calc(100vh-4.5rem)] bg-white px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <LangSwitch locale={locale} onChange={pickLocale} copy={copy} />
          <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm text-neutral-500">
            <ArrowLeft className="h-4 w-4" /> {copy.tools}
          </button>
        </div>
        <div className="mx-auto mt-16 max-w-2xl text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Tarifas 26/27</p>
          <h2 className="mt-3 font-display text-5xl font-semibold tracking-tight">{copy.whichTariff}</h2>
          <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-neutral-500">
            {copy.tariffHint}
          </p>
        </div>
        <div className="mx-auto mt-12 grid max-w-2xl gap-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => pickChannel('b2c')}
            className="rounded-[28px] border border-neutral-200 bg-white p-8 text-left transition hover:border-neutral-900"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-400">{copy.clubsWeb}</p>
            <p className="mt-2 font-display text-3xl font-semibold">B2C</p>
            <p className="mt-2 text-sm text-neutral-500">{copy.b2cFees}</p>
          </button>
          <button
            type="button"
            onClick={() => pickChannel('b2b')}
            className="rounded-[28px] border border-neutral-200 bg-white p-8 text-left transition hover:border-neutral-900"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-400">{copy.distribution}</p>
            <p className="mt-2 font-display text-3xl font-semibold">B2B</p>
            <p className="mt-2 text-sm text-neutral-500">{copy.b2bFees}</p>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="tarifas-shell -mx-6 -mb-8 min-h-[calc(100vh-4.5rem)] bg-white px-4 pb-24 pt-4 sm:px-6">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <LangSwitch locale={locale} onChange={pickLocale} copy={copy} />
            {admin ? (
              <span className="rounded-full bg-neutral-900 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white">{copy.adminOn}</span>
            ) : (
              <button type="button" onClick={() => setAskPin((open) => !open)} className="rounded-full p-2 text-neutral-400 hover:bg-neutral-50" aria-label={copy.adminUnlock}>
                <Lock className="h-4 w-4" />
              </button>
            )}
            {askPin && !admin ? (
              <form
                className="flex items-center gap-1"
                onSubmit={(event) => {
                  event.preventDefault();
                  tryAdmin();
                }}
              >
                <input
                  type="password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder={copy.adminUnlock}
                  className="h-8 w-36 rounded-full border border-neutral-200 px-3 text-xs outline-none"
                />
                <button type="submit" className="h-8 rounded-full bg-neutral-900 px-3 text-[11px] font-semibold text-white">{copy.adminEnter}</button>
              </form>
            ) : null}
            {askPin && !admin && status ? <p className="text-[11px] text-red-600">{status}</p> : null}
          </div>
          <WorkspaceChrome
            onBack={onBack}
            backLabel={copy.tools}
            tabs={visibleTabs}
            active={tab}
            onSelect={(id) => setTab(id as 'catalogo' | 'pack' | 'maestro')}
          />
        </div>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
              {channel.toUpperCase()} · {tab === 'pack' ? copy.pack : tab === 'maestro' ? copy.master : copy.catalog}
            </p>
            <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              {tab === 'pack' ? copy.packBuilder : tab === 'maestro' ? copy.liveCatalog : copy.offer}
            </h2>
          </div>
          <button type="button" onClick={() => { setChannel(null); setPack([]); }} className="text-xs font-semibold text-neutral-500">
            {copy.changeTariff}
          </button>
        </div>

        {tab === 'catalogo' ? (
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">{copy.tariff}</p>
            <div className="flex flex-wrap gap-2">
              {fees.map((level) => (
                <Pill key={level} active={fee === level} onClick={() => setFee(level)}>Fee {level}</Pill>
              ))}
            </div>
          </div>
        ) : null}

        {tab === 'catalogo' || tab === 'maestro' ? (
          <>
            {tab === 'maestro' ? (
              <div className="space-y-3 rounded-2xl border border-neutral-200 p-4">
                <p className="text-sm text-neutral-500">
                  {copy.masterHint}
                </p>
                <FileUpload
                  label={copy.masterUpload}
                  hint={copy.masterUploadHint}
                  inputId="tarifas-maestro"
                  compact
                  onFileLoaded={() => undefined}
                  onWorkbookLoaded={(sheets) => importSheets(sheets)}
                />
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={downloadCatalog} className="inline-flex h-10 items-center gap-2 rounded-full border border-neutral-200 px-4 text-xs font-semibold">
                    <Download className="h-4 w-4" /> {copy.downloadMaster}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const created = emptyProduct();
                      created.season = '26/27';
                      openItem(created);
                    }}
                    className="inline-flex h-10 items-center gap-2 rounded-full bg-neutral-900 px-4 text-xs font-semibold text-white"
                  >
                    <Plus className="h-4 w-4" /> {copy.newReference}
                  </button>
                </div>
                {status ? <p className="text-xs text-neutral-500">{status}</p> : null}
                {setupSql ? (
                  <p className="text-xs text-amber-700">
                    {copy.setupSql}
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <label className="relative min-w-[180px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={copy.search}
                  className="h-10 w-full rounded-full border border-neutral-200 bg-white py-0 pl-9 pr-4 text-sm outline-none"
                />
              </label>
              <select value={sport} onChange={(e) => setSport(e.target.value as TarifaSport | '')} className="h-10 rounded-full border border-neutral-200 bg-white px-3 text-sm">
                <option value="">{copy.sport}</option>
                {facets.sports.map((item) => <option key={item} value={item}>{copy.sports[item as TarifaSport] || item}</option>)}
              </select>
              <select value={gender} onChange={(e) => setGender(e.target.value as TarifaGender | '')} className="h-10 rounded-full border border-neutral-200 bg-white px-3 text-sm">
                <option value="">{copy.gender}</option>
                {facets.genders.map((item) => <option key={item} value={item}>{copy.genders[item]}</option>)}
              </select>
              <select value={type} onChange={(e) => { setType(e.target.value); setColour(''); }} className="h-10 rounded-full border border-neutral-200 bg-white px-3 text-sm">
                <option value="">{copy.type}</option>
                {facets.types.map((item) => <option key={item} value={item}>{labelProductType(locale, item)}</option>)}
              </select>
              <select value={colour} onChange={(e) => setColour(e.target.value)} className="h-10 rounded-full border border-neutral-200 bg-white px-3 text-sm">
                <option value="">{copy.colour}</option>
                {facets.colours.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="h-10 rounded-full border border-neutral-200 bg-white px-3 text-sm">
                <option value="nombre">{copy.sortName}</option>
                <option value="marca">{copy.sortBrand}</option>
                <option value="precio">{copy.sortPrice}</option>
                <option value="pvp">{copy.sortPvp}</option>
              </select>
              {filtersOn ? (
                <button type="button" onClick={clearFilters} className="h-10 rounded-full border border-neutral-200 px-4 text-xs font-semibold text-neutral-600 hover:bg-neutral-50">
                  {copy.clearFilters}
                </button>
              ) : null}
            </div>

            {facets.kinds.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                <Pill active={!kind} onClick={() => setKind('')}>{copy.all}</Pill>
                {facets.kinds.map((item) => (
                  <Pill key={item} active={kind === item} onClick={() => setKind(kind === item ? '' : item)}>{copy.kinds[item]}</Pill>
                ))}
              </div>
            ) : null}
            {facets.novelties.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                <Pill active={!novelty} onClick={() => setNovelty('')}>{copy.all}</Pill>
                {facets.novelties.includes('Nueva') || novelty === 'Nueva' ? (
                  <Pill active={novelty === 'Nueva'} onClick={() => setNovelty(novelty === 'Nueva' ? '' : 'Nueva')}>{copy.newCollection}</Pill>
                ) : null}
                {facets.novelties.includes('Año pasado') || novelty === 'Año pasado' ? (
                  <Pill active={novelty === 'Año pasado'} onClick={() => setNovelty(novelty === 'Año pasado' ? '' : 'Año pasado')}>{copy.lastSeason}</Pill>
                ) : null}
              </div>
            ) : null}
            {facets.ages.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {facets.ages.includes('both') ? (
                  <Pill active={ageFilter === 'both'} onClick={() => setAgeFilter(ageFilter === 'both' ? '' : 'both')}>{copy.adultAndYouth}</Pill>
                ) : null}
                {facets.ages.includes('adult') ? (
                  <Pill active={ageFilter === 'adult'} onClick={() => setAgeFilter(ageFilter === 'adult' ? '' : 'adult')}>{copy.adultOnly}</Pill>
                ) : null}
                {facets.ages.includes('youthOnly') ? (
                  <Pill active={ageFilter === 'youthOnly'} onClick={() => setAgeFilter(ageFilter === 'youthOnly' ? '' : 'youthOnly')}>{copy.youthOnly}</Pill>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-1.5">
              <Pill active={!brand} onClick={() => setBrand('')}>{copy.brands}</Pill>
              {facets.brands.map((item) => (
                <Pill key={item} active={brand === item} onClick={() => setBrand(item === brand ? '' : item)}>{item}</Pill>
              ))}
            </div>

            <p className="text-xs tabular-nums text-neutral-400">{filtered.length.toLocaleString(localeTag)} {copy.products}</p>

            {filtered.length === 0 ? (
              <p className="py-16 text-center text-sm text-neutral-400">{copy.emptyFilters}</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {filtered.map((item) => (
                  <article key={item.id} className="group overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                    <button type="button" onClick={() => openItem(item)} className="block w-full text-left">
                      <div className="relative aspect-square bg-neutral-50">
                        <Photo key={item.image || item.id} src={item.image} alt={item.name} className="h-full w-full p-4 transition group-hover:scale-[1.02]" />
                        {ageKind(item) === 'adult' ? (
                          <span className="absolute left-2 top-2">
                            <AgeChip tone="adult">{copy.adultOnly}</AgeChip>
                          </span>
                        ) : null}
                        {ageKind(item) === 'youthOnly' ? (
                          <span className="absolute left-2 top-2">
                            <AgeChip tone="youth">{copy.youthOnly}</AgeChip>
                          </span>
                        ) : null}
                        {isExpired(item.red) ? (
                          <span className="absolute right-2 top-2 rounded-full bg-neutral-900/80 px-2 py-0.5 text-[10px] font-semibold text-white">{copy.expired}</span>
                        ) : null}
                        {item.novelty === 'Nueva' ? (
                          <span className="absolute bottom-2 left-2 rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold">{copy.newBadge}</span>
                        ) : null}
                      </div>
                      <div className="space-y-1 px-3 pb-3 pt-3">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
                          {item.brand} · {labelProductType(locale, item.productType)}
                        </p>
                        <p className="line-clamp-2 font-display text-[15px] font-semibold leading-snug">{item.name}</p>
                        <p className="truncate text-[11px] text-neutral-500">{item.colour}</p>
                        <p className="pt-1 font-display text-lg font-semibold tabular-nums">{euro(sellPrice(item, channel, fee, 'adult'))}</p>
                        <PvpLines item={item} channel={channel} mode={ageFilter} copy={copy} localeTag={localeTag} />
                      </div>
                    </button>
                    {tab === 'catalogo' ? (
                      <div className="px-3 pb-3">
                        <button
                          type="button"
                          onClick={() => addToPack(item)}
                          className="inline-flex h-9 w-full items-center justify-center gap-1 rounded-full border border-neutral-200 text-[11px] font-semibold text-neutral-700 hover:bg-neutral-50"
                        >
                          <Plus className="h-3.5 w-3.5" /> {copy.addToPack}
                        </button>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="mx-auto max-w-6xl space-y-4">
            {pack.length === 0 ? (
              <p className="py-16 text-center text-sm text-neutral-400">
                {copy.emptyPack}
              </p>
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
                      const price = sellPrice(item, channel, line.fee, 'adult');
                      return (
                        <tr key={`${line.id}-${line.fee}`} className="bg-white align-top">
                          <td className="px-3 py-3 tabular-nums text-neutral-400">{index + 1}</td>
                          <td className="px-3 py-3">
                            <div className="flex gap-3">
                              <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-neutral-100 bg-white sm:h-28 sm:w-28">
                                <Photo src={item.image} alt={item.name} className="h-full w-full p-1.5" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-400">{labelProductType(locale, item.productType)}</p>
                                <p className="font-semibold leading-snug">{item.name}</p>
                                <p className="text-[11px] text-neutral-500">{item.colour}</p>
                                {ageKind(item) === 'adult' ? <div className="mt-1"><AgeChip tone="adult">{copy.adultOnly}</AgeChip></div> : null}
                                {ageKind(item) === 'youthOnly' ? <div className="mt-1"><AgeChip tone="youth">{copy.youthOnly}</AgeChip></div> : null}
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3 font-mono text-[11px]">{item.adultRef || '—'}</td>
                          <td className="px-3 py-3 font-mono text-[11px]">{item.youthRef || '—'}</td>
                          <td className="px-3 py-3">
                            <div className="flex flex-wrap gap-1">
                              {fees.map((level) => (
                                <button
                                  key={level}
                                  type="button"
                                  onClick={() => setPack((current) => current.map((row, i) => (i === index ? { ...row, fee: level } : row)))}
                                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                    line.fee === level ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600'
                                  }`}
                                >
                                  {level}
                                </button>
                              ))}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-right font-semibold tabular-nums">{euro(price)}</td>
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
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">{copy.totalPack} · {channel.toUpperCase()}</p>
              <p className="mt-2 font-display text-4xl font-semibold tabular-nums">{euro(totals.sale)}</p>
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
                {pack.length > 0 ? (
                  <button type="button" onClick={downloadPack} className="inline-flex h-10 items-center gap-2 rounded-full bg-neutral-900 px-4 text-xs font-semibold text-white">
                    <Download className="h-4 w-4" /> {copy.exportPack}
                  </button>
                ) : null}
                {pack.length > 0 ? (
                  <button type="button" onClick={() => setPack([])} className="text-xs font-semibold text-neutral-500">{copy.clearPack}</button>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </div>

      {tab === 'catalogo' ? (
        <button
          type="button"
          onClick={() => setCartOpen(true)}
          className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full bg-neutral-900 px-4 py-3 text-sm font-semibold text-white shadow-lg"
        >
          <ShoppingBag className="h-4 w-4" />
          {copy.pack}
          {pack.length > 0 ? <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-neutral-900">{pack.length}</span> : null}
        </button>
      ) : null}

      {cartOpen ? (
        <div className="fixed inset-0 z-50">
          <button type="button" className="absolute inset-0 bg-neutral-900/30" aria-label={copy.close} onClick={() => setCartOpen(false)} />
          <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">{copy.pack}</p>
                <h3 className="font-display text-2xl font-semibold">{copy.cartTitle}</h3>
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
                    return (
                      <li key={`${line.id}-${line.fee}`} className="flex gap-3 px-5 py-3">
                        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-neutral-50">
                          <Photo src={item.image} alt={item.name} className="h-full w-full p-1" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-400">{labelProductType(locale, item.productType)}</p>
                          <p className="truncate text-sm font-semibold">{item.name}</p>
                          <p className="text-[11px] text-neutral-500">{item.colour}</p>
                          <p className="mt-1 font-mono text-[10px] text-neutral-400">{item.adultRef || '—'}{item.youthRef ? ` · ${item.youthRef}` : ''}</p>
                          <p className="mt-1 text-sm font-semibold tabular-nums">{euro(sellPrice(item, channel, line.fee, 'adult'))}</p>
                        </div>
                        <button type="button" onClick={() => setPack((current) => current.filter((_, i) => i !== index))} className="self-start p-1 text-neutral-400 hover:text-red-600" aria-label={copy.removePack}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="border-t border-neutral-100 px-5 py-4">
              <p className="font-display text-3xl font-semibold tabular-nums">{euro(totals.sale)}</p>
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
              <div className="bg-neutral-50 p-6">
                <Photo key={draft.image || draft.id} src={draft.image} alt={draft.name} className="mx-auto max-h-[520px] w-full" />
              </div>
              <div className="flex flex-col p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
                      {draft.brand} · {labelProductType(locale, draft.productType)} · {copy.kinds[kindOf(draft)]}
                    </p>
                    <h3 className="mt-1 font-display text-2xl font-semibold tracking-tight">{draft.name || copy.newRef}</h3>
                    <p className="mt-1 text-sm text-neutral-500">{draft.colour}</p>
                  </div>
                  <button type="button" onClick={() => { setOpen(null); setDraft(null); }} className="rounded-md p-1 text-neutral-400" aria-label={copy.close}>
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {!editing ? (
                  <>
                    <div className="mt-4 flex flex-wrap items-center gap-1.5">
                      {ageKind(draft) === 'both' ? (
                        <>
                          <Pill active={openAge === 'adult'} onClick={() => setOpenAge('adult')}>{copy.adult}</Pill>
                          <Pill active={openAge === 'youth'} onClick={() => setOpenAge('youth')}>{copy.youth}</Pill>
                        </>
                      ) : ageKind(draft) === 'youthOnly' ? (
                        <AgeChip tone="youth">{copy.youthOnly}</AgeChip>
                      ) : (
                        <AgeChip tone="adult">{copy.adultOnly}</AgeChip>
                      )}
                    </div>
                    <p className="mt-2 font-mono text-sm text-neutral-700">{activeRef(draft, openAge) || '—'}</p>
                    {draft.red ? (
                      <p className={`mt-1 text-[11px] ${isExpired(draft.red) ? 'font-semibold text-neutral-900' : 'text-neutral-400'}`}>
                        {copy.validity} {formatRed(draft.red)}
                      </p>
                    ) : null}

                    <p className="mt-4 text-[11px] uppercase tracking-[0.12em] text-neutral-400">{copy.atPrice} · {channel.toUpperCase()}</p>
                    <div className="mt-2 overflow-hidden rounded-xl border border-neutral-200">
                      <table className="w-full text-sm">
                        <tbody>
                          <tr className="border-b border-neutral-100">
                            <td className="px-3 py-2 text-neutral-500">PVP</td>
                            <td className="px-3 py-2 text-right tabular-nums">{euro(rrpPrice(draft, channel, openAge))}</td>
                          </tr>
                          {fees.map((level) => (
                            <tr key={level} className="border-b border-neutral-100 last:border-0">
                              <td className="px-3 py-2 text-neutral-500">Fee {level}</td>
                              <td className="px-3 py-2 text-right font-semibold tabular-nums">{euro(sellPrice(draft, channel, level, openAge))}</td>
                            </tr>
                          ))}
                          <tr>
                            <td className="px-3 py-2 text-[11px] text-neutral-400">{copy.marginFee} {fee}</td>
                            <td className="px-3 py-2 text-right text-[11px] tabular-nums text-neutral-400">{pct(lineMargin(draft, channel, fee, openAge))}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
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
                    <button
                      type="button"
                      onClick={() => { addToPack(draft, fee); setOpen(null); setDraft(null); }}
                      className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-neutral-900 text-sm font-semibold text-white"
                    >
                      <Plus className="h-4 w-4" /> {copy.addToPack}
                    </button>
                  </>
                ) : (
                  <div className="mt-4 grid max-h-[70vh] grid-cols-2 gap-2 overflow-auto pr-1">
                    <Field label={copy.fieldBrand}><input className={inputClass} value={draft.brand} onChange={(e) => setDraft({ ...draft, brand: e.target.value })} /></Field>
                    <Field label={copy.fieldType}><input className={inputClass} value={draft.productType} onChange={(e) => setDraft({ ...draft, productType: e.target.value })} /></Field>
                    <div className="col-span-2">
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
                    <Field label="B2C PVP adulto"><input className={inputClass} value={draft.b2c.adultRrp ?? ''} onChange={(e) => setDraft({ ...draft, b2c: { ...draft.b2c, adultRrp: moneyFromInput(e.target.value) } })} /></Field>
                    <Field label="B2C PVP niño"><input className={inputClass} value={draft.b2c.youthRrp ?? ''} onChange={(e) => setDraft({ ...draft, b2c: { ...draft.b2c, youthRrp: moneyFromInput(e.target.value) } })} /></Field>
                    <Field label="B2C Fee 1"><input className={inputClass} value={draft.b2c.fee1 ?? ''} onChange={(e) => setDraft({ ...draft, b2c: { ...draft.b2c, fee1: moneyFromInput(e.target.value) } })} /></Field>
                    <Field label="B2C Fee 2"><input className={inputClass} value={draft.b2c.fee2 ?? ''} onChange={(e) => setDraft({ ...draft, b2c: { ...draft.b2c, fee2: moneyFromInput(e.target.value) } })} /></Field>
                    <Field label="B2C Fee 3"><input className={inputClass} value={draft.b2c.fee3 ?? ''} onChange={(e) => setDraft({ ...draft, b2c: { ...draft.b2c, fee3: moneyFromInput(e.target.value) } })} /></Field>
                    <Field label="B2C Fee 4"><input className={inputClass} value={draft.b2c.fee4 ?? ''} onChange={(e) => setDraft({ ...draft, b2c: { ...draft.b2c, fee4: moneyFromInput(e.target.value) } })} /></Field>
                    <Field label="B2C Neto adulto"><input className={inputClass} value={draft.b2c.adultNet ?? ''} onChange={(e) => setDraft({ ...draft, b2c: { ...draft.b2c, adultNet: moneyFromInput(e.target.value) } })} /></Field>
                    <Field label="B2C Neto niño"><input className={inputClass} value={draft.b2c.youthNet ?? ''} onChange={(e) => setDraft({ ...draft, b2c: { ...draft.b2c, youthNet: moneyFromInput(e.target.value) } })} /></Field>
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
    </div>
  );
}
