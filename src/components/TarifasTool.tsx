'use client';

import { useMemo, useState, type ReactNode } from 'react';
import WorkspaceChrome from '@/components/WorkspaceChrome';
import catalog from '@/data/tarifas-catalog.json';
import {
  activeRef,
  channelFees,
  colourways,
  formatEuro,
  hasAdult,
  hasYouth,
  kindOf,
  packTotals,
  rrpPrice,
  sellPrice,
  sportOf,
  uniqueSorted,
  type FeeLevel,
  type PackLine,
  type TarifaAge,
  type TarifaChannel,
  type TarifaKind,
  type TarifaProduct,
  type TarifaSport,
} from '@/lib/tarifas-model';
import { ArrowLeft, Minus, Plus, Search, Trash2, X } from 'lucide-react';

const PRODUCTS = catalog as TarifaProduct[];
const TABS = [
  { id: 'catalogo', label: 'Catálogo' },
  { id: 'pack', label: 'Pack' },
] as const;

function Photo({
  src,
  alt,
  className,
}: {
  src: string | null;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className={`flex items-center justify-center bg-white ${className || ''}`}>
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

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-9 rounded-full border px-3 text-xs font-semibold ${
        active
          ? 'border-neutral-900 bg-neutral-900 text-white'
          : 'border-neutral-200 bg-white text-neutral-600'
      }`}
    >
      {children}
    </button>
  );
}

function defaultAge(item: TarifaProduct): TarifaAge {
  return hasAdult(item) ? 'adult' : 'youth';
}

export default function TarifasTool({ onBack }: { onBack: () => void }) {
  const [channel, setChannel] = useState<TarifaChannel | null>(null);
  const [tab, setTab] = useState<'catalogo' | 'pack'>('catalogo');
  const [fee, setFee] = useState<FeeLevel>(1);
  const [query, setQuery] = useState('');
  const [brand, setBrand] = useState('');
  const [type, setType] = useState('');
  const [colour, setColour] = useState('');
  const [sport, setSport] = useState<TarifaSport | ''>('');
  const [kind, setKind] = useState<TarifaKind | ''>('');
  const [ageFilter, setAgeFilter] = useState<'' | 'adult' | 'youth' | 'both'>('');
  const [sort, setSort] = useState<'nombre' | 'marca' | 'precio' | 'pvp'>('nombre');
  const [open, setOpen] = useState<TarifaProduct | null>(null);
  const [openAge, setOpenAge] = useState<TarifaAge>('adult');
  const [pack, setPack] = useState<PackLine[]>([]);

  const fees = channel ? channelFees(channel) : [];
  const brands = useMemo(() => uniqueSorted(PRODUCTS, 'brand'), []);
  const types = useMemo(() => uniqueSorted(PRODUCTS, 'productType'), []);
  const colours = useMemo(() => {
    const pool = PRODUCTS.filter((item) => (!brand || item.brand === brand) && (!type || item.productType === type));
    return uniqueSorted(pool, 'colour');
  }, [brand, type]);
  const sports = useMemo(
    () => Array.from(new Set(PRODUCTS.map(sportOf))).sort((a, b) => a.localeCompare(b, 'es')),
    [],
  );

  const filtered = useMemo(() => {
    if (!channel) return [];
    const q = query.trim().toLocaleLowerCase('es');
    const rows = PRODUCTS.filter((item) => {
      if (brand && item.brand !== brand) return false;
      if (type && item.productType !== type) return false;
      if (colour && item.colour !== colour) return false;
      if (sport && sportOf(item) !== sport) return false;
      if (kind && kindOf(item) !== kind) return false;
      if (ageFilter === 'adult' && hasYouth(item)) return false;
      if (ageFilter === 'youth' && !hasYouth(item)) return false;
      if (ageFilter === 'both' && (!hasAdult(item) || !hasYouth(item))) return false;
      if (q) {
        const hay = `${item.brand} ${item.productType} ${item.name} ${item.colour} ${item.adultRef} ${item.youthRef}`.toLocaleLowerCase('es');
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
  }, [ageFilter, brand, channel, colour, fee, kind, query, sort, sport, type]);

  const totals = useMemo(() => (channel ? packTotals(PRODUCTS, pack, channel) : { pieces: 0, sale: 0 }), [channel, pack]);
  const packCount = pack.reduce((sum, line) => sum + line.qty, 0);
  const byId = useMemo(() => new Map(PRODUCTS.map((item) => [item.id, item])), []);

  const addToPack = (item: TarifaProduct, chosenFee = fee, age = defaultAge(item)) => {
    setPack((current) => {
      const hit = current.find((line) => line.id === item.id && line.fee === chosenFee && line.age === age);
      if (hit) return current.map((line) => (line === hit ? { ...line, qty: line.qty + 1 } : line));
      return [...current, { id: item.id, qty: 1, fee: chosenFee, age }];
    });
  };

  const patchLine = (index: number, update: Partial<PackLine>) => {
    setPack((current) => current.map((line, i) => (i === index ? { ...line, ...update } : line)));
  };

  const pickChannel = (next: TarifaChannel) => {
    setChannel(next);
    setFee(1);
    setTab('catalogo');
  };

  if (!channel) {
    return (
      <div className="tarifas-shell -mx-6 -mb-8 min-h-[calc(100vh-4.5rem)] bg-white px-4 py-8 sm:px-6">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm text-neutral-500">
          <ArrowLeft className="h-4 w-4" /> Herramientas
        </button>
        <div className="mx-auto mt-10 max-w-2xl text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">12 Tarifas</p>
          <h2 className="mt-2 font-display text-4xl font-semibold tracking-tight">¿Qué tarifa usas?</h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-neutral-500">
            B2C y B2B son listas distintas. Elige una: el catálogo y el pack se calculan con esa tarifa.
          </p>
        </div>
        <div className="mx-auto mt-10 grid max-w-2xl gap-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => pickChannel('b2c')}
            className="rounded-3xl border border-neutral-200 bg-white p-8 text-left transition hover:border-neutral-900"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-400">Clubs y web</p>
            <p className="mt-2 font-display text-3xl font-semibold">B2C</p>
            <p className="mt-2 text-sm text-neutral-500">Fee 1, 2, 3 y 4.</p>
          </button>
          <button
            type="button"
            onClick={() => pickChannel('b2b')}
            className="rounded-3xl border border-neutral-200 bg-white p-8 text-left transition hover:border-neutral-900"
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
      <div className="space-y-5">
        <WorkspaceChrome
          onBack={onBack}
          tabs={[...TABS]}
          active={tab}
          onSelect={(id) => setTab(id as 'catalogo' | 'pack')}
        />

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
              {channel.toUpperCase()} · {tab === 'pack' ? 'Pack' : 'Catálogo'}
            </p>
            <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              {tab === 'pack' ? 'Constructor de pack' : 'Qué puedo ofrecer'}
            </h2>
          </div>
          <button type="button" onClick={() => { setChannel(null); setPack([]); }} className="text-xs font-semibold text-neutral-500">
            Cambiar tarifa
          </button>
        </div>

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">Tarifa</p>
          <div className="flex flex-wrap gap-2">
            {fees.map((level) => (
              <Pill key={level} active={fee === level} onClick={() => setFee(level)}>Fee {level}</Pill>
            ))}
          </div>
        </div>

        {tab === 'catalogo' ? (
          <>
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
              <Pill active={kind === 'Personalizable'} onClick={() => setKind(kind === 'Personalizable' ? '' : 'Personalizable')}>Personalizable</Pill>
              <Pill active={kind === 'Catálogo'} onClick={() => setKind(kind === 'Catálogo' ? '' : 'Catálogo')}>Catálogo</Pill>
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

            <p className="text-xs tabular-nums text-neutral-400">
              {filtered.length.toLocaleString('es-ES')} productos
            </p>

            {filtered.length === 0 ? (
              <p className="py-16 text-center text-sm text-neutral-400">Nada con estos filtros.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                {filtered.map((item) => (
                  <article key={item.id} className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(item);
                        setOpenAge(defaultAge(item));
                      }}
                      className="block w-full text-left"
                    >
                      <div className="aspect-square bg-white">
                        <Photo key={item.image || item.id} src={item.image} alt={item.name} className="h-full w-full p-2" />
                      </div>
                      <div className="space-y-0.5 px-2.5 pb-2 pt-2">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
                          {item.brand} · {item.productType}
                        </p>
                        <p className="line-clamp-2 font-display text-[13px] font-semibold leading-snug">{item.name}</p>
                        <p className="truncate text-[11px] text-neutral-500">{item.colour}</p>
                        <p className="pt-1 font-display text-base font-semibold tabular-nums">{formatEuro(sellPrice(item, channel, fee))}</p>
                        <p className="text-[11px] tabular-nums text-neutral-400">PVP {formatEuro(rrpPrice(item, channel))}</p>
                        <p className="text-[10px] text-neutral-400">
                          {hasAdult(item) ? 'Adulto' : ''}
                          {hasAdult(item) && hasYouth(item) ? ' · ' : ''}
                          {hasYouth(item) ? 'Niño' : ''}
                        </p>
                      </div>
                    </button>
                    <div className="px-2.5 pb-2.5">
                      <button
                        type="button"
                        onClick={() => addToPack(item)}
                        className="inline-flex h-8 w-full items-center justify-center gap-1 rounded-full border border-neutral-200 text-[11px] font-semibold text-neutral-700 hover:bg-neutral-50"
                      >
                        <Plus className="h-3.5 w-3.5" /> Pack · Fee {fee}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="mx-auto max-w-3xl space-y-4">
            {pack.length === 0 ? (
              <p className="py-16 text-center text-sm text-neutral-400">
                Aún no hay nada. En el catálogo, añade camiseta, pantalón, medias…
              </p>
            ) : (
              <ul className="divide-y divide-neutral-200 overflow-hidden rounded-2xl border border-neutral-200">
                {pack.map((line, index) => {
                  const item = byId.get(line.id);
                  if (!item) return null;
                  const price = sellPrice(item, channel, line.fee, line.age);
                  return (
                    <li key={`${line.id}-${line.fee}-${line.age}-${index}`} className="flex flex-wrap items-center gap-3 bg-white p-3 sm:flex-nowrap">
                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-neutral-100 bg-white">
                        <Photo src={item.image} alt={item.name} className="h-full w-full p-1" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{item.name}</p>
                        <p className="text-[11px] text-neutral-500">
                          {item.colour} · {activeRef(item, line.age) || '—'}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {hasAdult(item) ? (
                            <button
                              type="button"
                              onClick={() => patchLine(index, { age: 'adult' })}
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${line.age === 'adult' ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600'}`}
                            >
                              Adulto
                            </button>
                          ) : null}
                          {hasYouth(item) ? (
                            <button
                              type="button"
                              onClick={() => patchLine(index, { age: 'youth' })}
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${line.age === 'youth' ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600'}`}
                            >
                              Niño
                            </button>
                          ) : null}
                          {fees.map((level) => (
                            <button
                              key={level}
                              type="button"
                              onClick={() => patchLine(index, { fee: level })}
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                line.fee === level ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600'
                              }`}
                            >
                              Fee {level}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => patchLine(index, { qty: Math.max(1, line.qty - 1) })} className="rounded-full p-1 text-neutral-500 hover:bg-neutral-100" aria-label="Quitar una">
                          <Minus className="h-4 w-4" />
                        </button>
                        <span className="w-6 text-center text-sm tabular-nums">{line.qty}</span>
                        <button type="button" onClick={() => patchLine(index, { qty: line.qty + 1 })} className="rounded-full p-1 text-neutral-500 hover:bg-neutral-100" aria-label="Añadir una">
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="w-24 text-right">
                        <p className="text-sm font-semibold tabular-nums">{formatEuro(price == null ? null : price * line.qty)}</p>
                        <p className="text-[10px] tabular-nums text-neutral-400">PVP {formatEuro(rrpPrice(item, channel, line.age))}</p>
                      </div>
                      <button type="button" onClick={() => setPack((current) => current.filter((_, i) => i !== index))} className="p-1 text-neutral-400 hover:text-red-600" aria-label="Quitar del pack">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="rounded-2xl border border-neutral-200 bg-white p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">Total pack · {channel.toUpperCase()}</p>
              <p className="mt-1 font-display text-3xl font-semibold tabular-nums">{formatEuro(totals.sale)}</p>
              <p className="mt-1 text-sm text-neutral-500">{totals.pieces} prenda{totals.pieces === 1 ? '' : 's'}</p>
              {pack.length > 0 ? (
                <button type="button" onClick={() => setPack([])} className="mt-3 text-xs font-semibold text-neutral-500">
                  Vaciar
                </button>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {packCount > 0 && tab === 'catalogo' ? (
        <button
          type="button"
          onClick={() => setTab('pack')}
          className="fixed bottom-5 left-1/2 z-40 -translate-x-1/2 rounded-full bg-neutral-900 px-5 py-3 text-sm font-semibold text-white shadow-lg"
        >
          Pack · {packCount} · {formatEuro(totals.sale)}
        </button>
      ) : null}

      {open ? (
        <div className="abonos-modal-backdrop" onClick={() => setOpen(null)}>
          <div
            className="abonos-modal overflow-hidden bg-white"
            style={{ width: 'min(860px, 100%)' }}
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="grid md:grid-cols-2">
              <div className="bg-white p-5">
                <Photo key={open.image || open.id} src={open.image} alt={open.name} className="mx-auto max-h-[520px] w-full" />
              </div>
              <div className="flex flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
                      {open.brand} · {open.productType} · {kindOf(open)}
                    </p>
                    <h3 className="mt-1 font-display text-2xl font-semibold tracking-tight">{open.name}</h3>
                    <p className="mt-1 text-sm text-neutral-500">{open.colour}</p>
                  </div>
                  <button type="button" onClick={() => setOpen(null)} className="rounded-md p-1 text-neutral-400" aria-label="Cerrar">
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {hasAdult(open) ? (
                    <Pill active={openAge === 'adult'} onClick={() => setOpenAge('adult')}>Adulto</Pill>
                  ) : null}
                  {hasYouth(open) ? (
                    <Pill active={openAge === 'youth'} onClick={() => setOpenAge('youth')}>Niño</Pill>
                  ) : (
                    <span className="self-center text-[11px] text-neutral-400">No hay referencia de niño</span>
                  )}
                </div>
                <p className="mt-2 font-mono text-sm text-neutral-700">{activeRef(open, openAge) || '—'}</p>

                <p className="mt-4 text-[11px] uppercase tracking-[0.12em] text-neutral-400">A qué precio · {channel.toUpperCase()}</p>
                <div className="mt-2 overflow-hidden rounded-xl border border-neutral-200">
                  <table className="w-full text-sm">
                    <tbody>
                      <tr className="border-b border-neutral-100">
                        <td className="px-3 py-2 text-neutral-500">PVP</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatEuro(rrpPrice(open, channel, openAge))}</td>
                      </tr>
                      {fees.map((level) => (
                        <tr key={level} className="border-b border-neutral-100 last:border-0">
                          <td className="px-3 py-2 text-neutral-500">Fee {level}</td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatEuro(sellPrice(open, channel, level, openAge))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {colourways(PRODUCTS, open).length > 1 ? (
                  <div className="mt-4">
                    <p className="text-[11px] uppercase tracking-[0.12em] text-neutral-400">Colores</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {colourways(PRODUCTS, open).map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => { setOpen(item); setOpenAge(defaultAge(item)); }}
                          className={`rounded-lg border px-2 py-1 text-[11px] ${item.id === open.id ? 'border-neutral-900' : 'border-neutral-200'}`}
                        >
                          {item.colour}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => { addToPack(open, fee, openAge); setOpen(null); setTab('pack'); }}
                  className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-neutral-900 text-sm font-semibold text-white"
                >
                  <Plus className="h-4 w-4" /> Añadir al pack · {openAge === 'youth' ? 'Niño' : 'Adulto'} · Fee {fee}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
