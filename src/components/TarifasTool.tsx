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
  type TarifaChannel,
  type TarifaGender,
  type TarifaKind,
  type TarifaNovelty,
  type TarifaProduct,
  type TarifaSport,
} from '@/lib/tarifas-model';
import { loadTarifasCatalog, saveTarifasCatalog, type TarifasBackend } from '@/lib/tarifas-store';
import { ArrowLeft, Download, Plus, Search, Trash2, X } from 'lucide-react';

const SEED = (catalog as unknown[]).map(asProduct);
const TABS = [
  { id: 'catalogo', label: 'Catálogo' },
  { id: 'pack', label: 'Pack' },
  { id: 'maestro', label: 'Maestro' },
] as const;

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

function PvpLines({
  item,
  channel,
  mode,
}: {
  item: TarifaProduct;
  channel: TarifaChannel;
  mode: '' | 'adult' | 'youth' | 'both';
}) {
  const adult = rrpPrice(item, channel, 'adult');
  const youth = rrpPrice(item, channel, 'youth');
  const showAdult = mode !== 'youth';
  const showYouth = hasYouth(item) && mode !== 'adult';
  if (!showYouth) {
    return <p className="text-[11px] tabular-nums text-neutral-400">PVP {formatEuro(adult)}</p>;
  }
  if (!showAdult) {
    return <p className="text-[11px] tabular-nums text-neutral-400">PVP niño {formatEuro(youth)}</p>;
  }
  return (
    <p className="text-[11px] tabular-nums text-neutral-400">
      PVP {formatEuro(adult)}
      <span className="text-neutral-300"> · </span>
      niño {formatEuro(youth)}
    </p>
  );
}

export default function TarifasTool({ onBack }: { onBack: () => void }) {
  const [products, setProducts] = useState<TarifaProduct[]>(SEED);
  const [backend, setBackend] = useState<TarifasBackend>('local');
  const [setupSql, setSetupSql] = useState<string>();
  const [status, setStatus] = useState('');
  const [channel, setChannel] = useState<TarifaChannel | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('catalogo');
  const [fee, setFee] = useState<FeeLevel>(1);
  const [query, setQuery] = useState('');
  const [brand, setBrand] = useState('');
  const [type, setType] = useState('');
  const [colour, setColour] = useState('');
  const [sport, setSport] = useState<TarifaSport | ''>('');
  const [gender, setGender] = useState<TarifaGender | ''>('');
  const [kind, setKind] = useState<TarifaKind | ''>('');
  const [novelty, setNovelty] = useState<TarifaNovelty | ''>('');
  const [ageFilter, setAgeFilter] = useState<'' | 'adult' | 'youth' | 'both'>('');
  const [sort, setSort] = useState<'nombre' | 'marca' | 'precio' | 'pvp'>('nombre');
  const [open, setOpen] = useState<TarifaProduct | null>(null);
  const [openAge, setOpenAge] = useState<TarifaAge>('adult');
  const [draft, setDraft] = useState<TarifaProduct | null>(null);
  const [pack, setPack] = useState<PackLine[]>([]);

  useEffect(() => {
    loadTarifasCatalog(SEED).then((loaded) => {
      setProducts(loaded.products);
      setBackend(loaded.backend);
      setSetupSql(loaded.setupSql);
    });
  }, []);

  const fees = channel ? channelFees(channel) : [];
  const brands = useMemo(() => uniqueSorted(products, 'brand'), [products]);
  const types = useMemo(() => uniqueSorted(products, 'productType'), [products]);
  const colours = useMemo(() => {
    const pool = products.filter((item) => (!brand || item.brand === brand) && (!type || item.productType === type));
    return uniqueSorted(pool, 'colour');
  }, [brand, products, type]);
  const sports = useMemo(() => {
    const present = Array.from(new Set(products.map((item) => item.sport)));
    return SPORTS.filter((item) => present.includes(item)).concat(present.filter((item) => !SPORTS.includes(item as TarifaSport)));
  }, [products]);

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
      if (ageFilter === 'adult' && hasYouth(item)) return false;
      if (ageFilter === 'youth' && !hasYouth(item)) return false;
      if (ageFilter === 'both' && !hasYouth(item)) return false;
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
  const editing = tab === 'maestro';

  const persist = async (next: TarifaProduct[]) => {
    setProducts(next);
    try {
      await saveTarifasCatalog(next, backend);
      setStatus(backend === 'supabase' ? 'Guardado para toda la red.' : 'Guardado en este navegador.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'No se pudo guardar.');
    }
  };

  const addToPack = (item: TarifaProduct, chosenFee = fee) => {
    setPack((current) => {
      if (current.some((line) => line.id === item.id && line.fee === chosenFee)) return current;
      return [...current, { id: item.id, fee: chosenFee, stamp: 0, stampInput: '' }];
    });
  };

  const pickChannel = (next: TarifaChannel) => {
    setChannel(next);
    setFee(1);
    setTab('catalogo');
  };

  const openItem = (item: TarifaProduct) => {
    setOpen(item);
    setOpenAge(hasYouth(item) && ageFilter === 'youth' ? 'youth' : 'adult');
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
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(packExportRows(products, pack, channel)), 'Pack');
    XLSX.writeFile(workbook, `Pack_${channel.toUpperCase()}.xlsx`);
  };

  const importSheets = async (sheets: Record<string, unknown[][]>) => {
    const parsed = parseTarifasSheets(sheets);
    if (parsed.length === 0) {
      setStatus('Ese Excel no tiene referencias.');
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
    setStatus(`${next.length.toLocaleString('es-ES')} referencias. Lo que no está en el Excel, sale de la web.`);
  };

  if (!channel) {
    return (
      <div className="tarifas-shell -mx-6 -mb-8 min-h-[calc(100vh-4.5rem)] bg-white px-4 py-8 sm:px-6">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm text-neutral-500">
          <ArrowLeft className="h-4 w-4" /> Herramientas
        </button>
        <div className="mx-auto mt-16 max-w-2xl text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Tarifas 26/27</p>
          <h2 className="mt-3 font-display text-5xl font-semibold tracking-tight">¿Qué tarifa usas?</h2>
          <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-neutral-500">
            B2C y B2B son listas distintas. El catálogo y el pack se calculan con esa tarifa.
          </p>
        </div>
        <div className="mx-auto mt-12 grid max-w-2xl gap-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => pickChannel('b2c')}
            className="rounded-[28px] border border-neutral-200 bg-white p-8 text-left transition hover:border-neutral-900"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-400">Clubs y web</p>
            <p className="mt-2 font-display text-3xl font-semibold">B2C</p>
            <p className="mt-2 text-sm text-neutral-500">Fee 1, 2, 3 y 4.</p>
          </button>
          <button
            type="button"
            onClick={() => pickChannel('b2b')}
            className="rounded-[28px] border border-neutral-200 bg-white p-8 text-left transition hover:border-neutral-900"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-400">Distribución</p>
            <p className="mt-2 font-display text-3xl font-semibold">B2B</p>
            <p className="mt-2 text-sm text-neutral-500">Fee 1, 2 y 3. Adulto y niño van por separado.</p>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="tarifas-shell -mx-6 -mb-8 min-h-[calc(100vh-4.5rem)] bg-white px-4 pb-24 pt-4 sm:px-6">
      <div className="space-y-6">
        <WorkspaceChrome
          onBack={onBack}
          tabs={[...TABS]}
          active={tab}
          onSelect={(id) => setTab(id as (typeof TABS)[number]['id'])}
        />

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
              {channel.toUpperCase()} · {tab === 'pack' ? 'Pack' : tab === 'maestro' ? 'Maestro' : 'Catálogo'}
            </p>
            <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              {tab === 'pack' ? 'Constructor de pack' : tab === 'maestro' ? 'Catálogo vivo' : 'Qué puedo ofrecer'}
            </h2>
          </div>
          <button type="button" onClick={() => { setChannel(null); setPack([]); }} className="text-xs font-semibold text-neutral-500">
            Cambiar tarifa
          </button>
        </div>

        {tab !== 'maestro' ? (
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">Tarifa</p>
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
                  Sube el Excel y sustituye el catálogo entero. Descárgalo, cambia lo que quieras y vuelve a importar. Si son pocas cosas, abre la ficha y edita.
                </p>
                <FileUpload
                  label="Sube el maestro de tarifas"
                  hint="Plantilla propia o el Excel B2C/B2B de 26/27."
                  inputId="tarifas-maestro"
                  compact
                  onFileLoaded={() => undefined}
                  onWorkbookLoaded={(sheets) => importSheets(sheets)}
                />
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={downloadCatalog} className="inline-flex h-10 items-center gap-2 rounded-full border border-neutral-200 px-4 text-xs font-semibold">
                    <Download className="h-4 w-4" /> Descargar maestro
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
                    <Plus className="h-4 w-4" /> Nueva referencia
                  </button>
                </div>
                {status ? <p className="text-xs text-neutral-500">{status}</p> : null}
                {setupSql ? (
                  <p className="text-xs text-amber-700">
                    Si quieres que la red comercial vea tus cambios, hay que crear la tabla `tarifas_store` en Supabase.
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
                  placeholder="Producto, color o referencia"
                  className="h-10 w-full rounded-full border border-neutral-200 bg-white py-0 pl-9 pr-4 text-sm outline-none"
                />
              </label>
              <select value={sport} onChange={(e) => setSport(e.target.value as TarifaSport | '')} className="h-10 rounded-full border border-neutral-200 bg-white px-3 text-sm">
                <option value="">Deporte</option>
                {sports.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <select value={gender} onChange={(e) => setGender(e.target.value as TarifaGender | '')} className="h-10 rounded-full border border-neutral-200 bg-white px-3 text-sm">
                <option value="">Género</option>
                {GENDERS.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <select value={type} onChange={(e) => { setType(e.target.value); setColour(''); }} className="h-10 rounded-full border border-neutral-200 bg-white px-3 text-sm">
                <option value="">Tipo</option>
                {types.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <select value={colour} onChange={(e) => setColour(e.target.value)} className="h-10 rounded-full border border-neutral-200 bg-white px-3 text-sm">
                <option value="">Color</option>
                {colours.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="h-10 rounded-full border border-neutral-200 bg-white px-3 text-sm">
                <option value="nombre">Ordenar: nombre</option>
                <option value="marca">Ordenar: marca</option>
                <option value="precio">Ordenar: precio</option>
                <option value="pvp">Ordenar: PVP</option>
              </select>
            </div>

            <div className="flex flex-wrap gap-1.5">
              <Pill active={!kind} onClick={() => setKind('')}>Todo</Pill>
              {KINDS.map((item) => (
                <Pill key={item} active={kind === item} onClick={() => setKind(kind === item ? '' : item)}>{item}</Pill>
              ))}
              {NOVELTIES.map((item) => (
                <Pill key={item} active={novelty === item} onClick={() => setNovelty(novelty === item ? '' : item)}>{item}</Pill>
              ))}
              <Pill active={ageFilter === 'both'} onClick={() => setAgeFilter(ageFilter === 'both' ? '' : 'both')}>Adulto y niño</Pill>
              <Pill active={ageFilter === 'adult'} onClick={() => setAgeFilter(ageFilter === 'adult' ? '' : 'adult')}>Solo adulto</Pill>
              <Pill active={ageFilter === 'youth'} onClick={() => setAgeFilter(ageFilter === 'youth' ? '' : 'youth')}>Con niño</Pill>
            </div>

            <div className="flex flex-wrap gap-1.5">
              <Pill active={!brand} onClick={() => setBrand('')}>Marcas</Pill>
              {brands.map((item) => (
                <Pill key={item} active={brand === item} onClick={() => setBrand(item === brand ? '' : item)}>{item}</Pill>
              ))}
            </div>

            <p className="text-xs tabular-nums text-neutral-400">{filtered.length.toLocaleString('es-ES')} productos</p>

            {filtered.length === 0 ? (
              <p className="py-16 text-center text-sm text-neutral-400">Nada con estos filtros.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {filtered.map((item) => (
                  <article key={item.id} className="group overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                    <button type="button" onClick={() => openItem(item)} className="block w-full text-left">
                      <div className="relative aspect-square bg-neutral-50">
                        <Photo key={item.image || item.id} src={item.image} alt={item.name} className="h-full w-full p-4 transition group-hover:scale-[1.02]" />
                        {!hasYouth(item) ? (
                          <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-neutral-700">Solo adulto</span>
                        ) : null}
                        {isExpired(item.red) ? (
                          <span className="absolute right-2 top-2 rounded-full bg-neutral-900/80 px-2 py-0.5 text-[10px] font-semibold text-white">Fuera de vigencia</span>
                        ) : null}
                        {item.novelty === 'Nueva' ? (
                          <span className="absolute bottom-2 left-2 rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold">Nueva</span>
                        ) : null}
                      </div>
                      <div className="space-y-1 px-3 pb-3 pt-3">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
                          {item.brand} · {item.productType}
                        </p>
                        <p className="line-clamp-2 font-display text-[15px] font-semibold leading-snug">{item.name}</p>
                        <p className="flex items-center gap-1.5 truncate text-[11px] text-neutral-500">
                          {item.colorHex ? <span className="h-2.5 w-2.5 rounded-full border border-neutral-200" style={{ background: item.colorHex }} /> : null}
                          {item.colour}
                        </p>
                        <p className="pt-1 font-display text-lg font-semibold tabular-nums">{formatEuro(sellPrice(item, channel, fee, 'adult'))}</p>
                        <PvpLines item={item} channel={channel} mode={ageFilter} />
                      </div>
                    </button>
                    {tab === 'catalogo' ? (
                      <div className="px-3 pb-3">
                        <button
                          type="button"
                          onClick={() => addToPack(item)}
                          className="inline-flex h-9 w-full items-center justify-center gap-1 rounded-full border border-neutral-200 text-[11px] font-semibold text-neutral-700 hover:bg-neutral-50"
                        >
                          <Plus className="h-3.5 w-3.5" /> Pack · Fee {fee}
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
                Aún no hay nada. En el catálogo, monta camiseta, pantalón, medias… o lo que pida el club.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-neutral-200">
                <table className="min-w-[860px] w-full text-left text-sm">
                  <thead className="bg-neutral-50 text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
                    <tr>
                      <th className="px-3 py-2 font-semibold">#</th>
                      <th className="px-3 py-2 font-semibold">Producto</th>
                      <th className="px-3 py-2 font-semibold">Ref. adulto</th>
                      <th className="px-3 py-2 font-semibold">Ref. niño</th>
                      <th className="px-3 py-2 font-semibold">Fee club</th>
                      <th className="px-3 py-2 font-semibold text-right">Precio club</th>
                      <th className="px-3 py-2 font-semibold text-right">Estampac.</th>
                      <th className="px-3 py-2 font-semibold text-right">Fuera pack</th>
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
                              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-neutral-100 bg-white">
                                <Photo src={item.image} alt={item.name} className="h-full w-full p-1" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-400">{item.productType}</p>
                                <p className="font-semibold leading-snug">{item.name}</p>
                                <p className="text-[11px] text-neutral-500">{item.colour}</p>
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
                          <td className="px-3 py-3 text-right font-semibold tabular-nums">{formatEuro(price)}</td>
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
                              aria-label="Precio estampación"
                            />
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums text-neutral-500">{formatEuro(fueraPackPrice(item, channel))}</td>
                          <td className="px-3 py-3">
                            <button type="button" onClick={() => setPack((current) => current.filter((_, i) => i !== index))} className="p-1 text-neutral-400 hover:text-red-600" aria-label="Quitar del pack">
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
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">Total pack · {channel.toUpperCase()}</p>
              <p className="mt-2 font-display text-4xl font-semibold tabular-nums">{formatEuro(totals.sale)}</p>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
                <div>
                  <p className="text-[11px] text-neutral-400">Precio club</p>
                  <p className="font-semibold tabular-nums">{formatEuro(totals.club)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-neutral-400">Estampación</p>
                  <p className="font-semibold tabular-nums">{formatEuro(totals.stamp)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-neutral-400">Fuera pack</p>
                  <p className="font-semibold tabular-nums">{formatEuro(totals.fuera)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-neutral-400">PVP</p>
                  <p className="font-semibold tabular-nums">{formatEuro(totals.rrp)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-neutral-400">Margen</p>
                  <p className="font-semibold tabular-nums">{formatPct(totals.margin)}</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                {pack.length > 0 ? (
                  <button type="button" onClick={downloadPack} className="inline-flex h-10 items-center gap-2 rounded-full bg-neutral-900 px-4 text-xs font-semibold text-white">
                    <Download className="h-4 w-4" /> Exportar pack
                  </button>
                ) : null}
                {pack.length > 0 ? (
                  <button type="button" onClick={() => setPack([])} className="text-xs font-semibold text-neutral-500">Vaciar</button>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </div>

      {pack.length > 0 && tab === 'catalogo' ? (
        <button
          type="button"
          onClick={() => setTab('pack')}
          className="fixed bottom-5 left-1/2 z-40 -translate-x-1/2 rounded-full bg-neutral-900 px-5 py-3 text-sm font-semibold text-white shadow-lg"
        >
          Pack · {pack.length} · {formatEuro(totals.sale)}
        </button>
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
                      {draft.brand} · {draft.productType} · {kindOf(draft)}
                    </p>
                    <h3 className="mt-1 font-display text-2xl font-semibold tracking-tight">{draft.name || 'Nueva referencia'}</h3>
                    <p className="mt-1 text-sm text-neutral-500">{draft.colour}</p>
                  </div>
                  <button type="button" onClick={() => { setOpen(null); setDraft(null); }} className="rounded-md p-1 text-neutral-400" aria-label="Cerrar">
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {!editing ? (
                  <>
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      <Pill active={openAge === 'adult'} onClick={() => setOpenAge('adult')}>Adulto</Pill>
                      {hasYouth(draft) ? (
                        <Pill active={openAge === 'youth'} onClick={() => setOpenAge('youth')}>Niño</Pill>
                      ) : (
                        <span className="self-center rounded-full bg-neutral-100 px-2 py-1 text-[11px] font-semibold text-neutral-500">Solo adulto</span>
                      )}
                    </div>
                    <p className="mt-2 font-mono text-sm text-neutral-700">{activeRef(draft, openAge) || '—'}</p>
                    {draft.red ? (
                      <p className={`mt-1 text-[11px] ${isExpired(draft.red) ? 'font-semibold text-neutral-900' : 'text-neutral-400'}`}>
                        Vigencia {formatRed(draft.red)}
                      </p>
                    ) : null}

                    <p className="mt-4 text-[11px] uppercase tracking-[0.12em] text-neutral-400">A qué precio · {channel.toUpperCase()}</p>
                    <div className="mt-2 overflow-hidden rounded-xl border border-neutral-200">
                      <table className="w-full text-sm">
                        <tbody>
                          <tr className="border-b border-neutral-100">
                            <td className="px-3 py-2 text-neutral-500">PVP</td>
                            <td className="px-3 py-2 text-right tabular-nums">{formatEuro(rrpPrice(draft, channel, openAge))}</td>
                          </tr>
                          {fees.map((level) => (
                            <tr key={level} className="border-b border-neutral-100 last:border-0">
                              <td className="px-3 py-2 text-neutral-500">Fee {level}</td>
                              <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatEuro(sellPrice(draft, channel, level, openAge))}</td>
                            </tr>
                          ))}
                          <tr>
                            <td className="px-3 py-2 text-[11px] text-neutral-400">Margen Fee {fee}</td>
                            <td className="px-3 py-2 text-right text-[11px] tabular-nums text-neutral-400">{formatPct(lineMargin(draft, channel, fee, openAge))}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    {colourways(products, draft).length > 1 ? (
                      <div className="mt-4">
                        <p className="text-[11px] uppercase tracking-[0.12em] text-neutral-400">Colores</p>
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
                      onClick={() => { addToPack(draft, fee); setOpen(null); setDraft(null); setTab('pack'); }}
                      className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-neutral-900 text-sm font-semibold text-white"
                    >
                      <Plus className="h-4 w-4" /> Añadir al pack · Fee {fee}
                    </button>
                  </>
                ) : (
                  <div className="mt-4 grid max-h-[70vh] grid-cols-2 gap-2 overflow-auto pr-1">
                    <Field label="Marca"><input className={inputClass} value={draft.brand} onChange={(e) => setDraft({ ...draft, brand: e.target.value })} /></Field>
                    <Field label="Tipo"><input className={inputClass} value={draft.productType} onChange={(e) => setDraft({ ...draft, productType: e.target.value })} /></Field>
                    <div className="col-span-2">
                      <Field label="Nombre"><input className={inputClass} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
                    </div>
                    <Field label="Color"><input className={inputClass} value={draft.colour} onChange={(e) => setDraft({ ...draft, colour: e.target.value })} /></Field>
                    <Field label="URL imagen"><input className={inputClass} value={draft.image || ''} onChange={(e) => setDraft({ ...draft, image: e.target.value || null })} /></Field>
                    <Field label="Ref. adulto"><input className={inputClass} value={draft.adultRef} onChange={(e) => setDraft({ ...draft, adultRef: e.target.value, id: e.target.value || draft.id })} /></Field>
                    <Field label="Ref. niño"><input className={inputClass} value={draft.youthRef} onChange={(e) => setDraft({ ...draft, youthRef: e.target.value })} /></Field>
                    <Field label="Deporte">
                      <select className={inputClass} value={draft.sport} onChange={(e) => setDraft({ ...draft, sport: e.target.value as TarifaSport })}>
                        {SPORTS.map((item) => <option key={item}>{item}</option>)}
                      </select>
                    </Field>
                    <Field label="Género">
                      <select className={inputClass} value={draft.gender} onChange={(e) => setDraft({ ...draft, gender: e.target.value as TarifaGender })}>
                        {GENDERS.map((item) => <option key={item}>{item}</option>)}
                      </select>
                    </Field>
                    <Field label="Surtido">
                      <select className={inputClass} value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as TarifaKind })}>
                        {KINDS.map((item) => <option key={item}>{item}</option>)}
                      </select>
                    </Field>
                    <Field label="Novedad">
                      <select className={inputClass} value={draft.novelty} onChange={(e) => setDraft({ ...draft, novelty: e.target.value as TarifaNovelty | '' })}>
                        <option value="">Sin marcar</option>
                        {NOVELTIES.map((item) => <option key={item}>{item}</option>)}
                      </select>
                    </Field>
                    <Field label="Colección"><input className={inputClass} value={draft.collection} onChange={(e) => setDraft({ ...draft, collection: e.target.value })} /></Field>
                    <Field label="Temporada"><input className={inputClass} value={draft.season} onChange={(e) => setDraft({ ...draft, season: e.target.value })} /></Field>
                    <Field label="Vigencia RED"><input className={inputClass} type="date" value={draft.red || ''} onChange={(e) => setDraft({ ...draft, red: e.target.value || null })} /></Field>
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
                        Guardar referencia
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
                          Quitar
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
