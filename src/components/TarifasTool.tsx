'use client';

import { useMemo, useState, type ReactNode } from 'react';
import WorkspaceChrome from '@/components/WorkspaceChrome';
import catalog from '@/data/tarifas-catalog.json';
import {
  colourways,
  formatEuro,
  formatPct,
  packTotals,
  rrpPrice,
  sellPrice,
  uniqueSorted,
  type FeeLevel,
  type PackLine,
  type TarifaChannel,
  type TarifaProduct,
} from '@/lib/tarifas-model';
import { Minus, Plus, Search, Trash2, X } from 'lucide-react';

const PRODUCTS = catalog as TarifaProduct[];
const TABS = [
  { id: 'catalogo', label: 'Catálogo' },
  { id: 'pack', label: 'Pack' },
] as const;
const FEES: FeeLevel[] = [1, 2, 3, 4];

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

export default function TarifasTool({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<'catalogo' | 'pack'>('catalogo');
  const [channel, setChannel] = useState<TarifaChannel>('b2c');
  const [fee, setFee] = useState<FeeLevel>(1);
  const [query, setQuery] = useState('');
  const [brand, setBrand] = useState('');
  const [type, setType] = useState('');
  const [colour, setColour] = useState('');
  const [open, setOpen] = useState<TarifaProduct | null>(null);
  const [pack, setPack] = useState<PackLine[]>([]);
  const [sort, setSort] = useState<'nombre' | 'precio-asc' | 'precio-desc'>('nombre');

  const brands = useMemo(() => uniqueSorted(PRODUCTS, 'brand'), []);
  const types = useMemo(() => uniqueSorted(PRODUCTS, 'productType'), []);
  const colours = useMemo(() => {
    const pool = PRODUCTS.filter((item) => (!brand || item.brand === brand) && (!type || item.productType === type));
    return uniqueSorted(pool, 'colour');
  }, [brand, type]);

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('es');
    const rows = PRODUCTS.filter((item) => {
      if (brand && item.brand !== brand) return false;
      if (type && item.productType !== type) return false;
      if (colour && item.colour !== colour) return false;
      if (q) {
        const hay = `${item.brand} ${item.productType} ${item.name} ${item.colour} ${item.adultRef} ${item.youthRef}`.toLocaleLowerCase('es');
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    return rows.slice().sort((a, b) => {
      if (sort === 'nombre') return a.name.localeCompare(b.name, 'es') || a.colour.localeCompare(b.colour, 'es');
      const pa = sellPrice(a, channel, fee) ?? 0;
      const pb = sellPrice(b, channel, fee) ?? 0;
      return sort === 'precio-asc' ? pa - pb : pb - pa;
    });
  }, [brand, channel, colour, fee, query, sort, type]);

  const totals = useMemo(() => packTotals(PRODUCTS, pack, channel), [channel, pack]);
  const packCount = pack.reduce((sum, line) => sum + line.qty, 0);

  const addToPack = (item: TarifaProduct, chosenFee = fee) => {
    setPack((current) => {
      const hit = current.find((line) => line.id === item.id && line.fee === chosenFee);
      if (hit) {
        return current.map((line) => (line === hit ? { ...line, qty: line.qty + 1 } : line));
      }
      return [...current, { id: item.id, qty: 1, fee: chosenFee }];
    });
  };

  const patchLine = (index: number, update: Partial<PackLine>) => {
    setPack((current) => current.map((line, i) => (i === index ? { ...line, ...update } : line)));
  };

  const byId = useMemo(() => new Map(PRODUCTS.map((item) => [item.id, item])), []);

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
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">12 Tarifas</p>
            <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              {tab === 'pack' ? 'Constructor de pack' : 'Qué puedo ofrecer'}
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              {tab === 'pack'
                ? 'Añade prendas, elige tarifa y mira el total.'
                : `Precio ${channel.toUpperCase()} · Fee ${fee}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Pill active={channel === 'b2c'} onClick={() => setChannel('b2c')}>B2C</Pill>
            <Pill active={channel === 'b2b'} onClick={() => setChannel('b2b')}>B2B</Pill>
            {FEES.filter((level) => channel === 'b2c' || level < 4).map((level) => (
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
              <select value={type} onChange={(e) => { setType(e.target.value); setColour(''); }} className="h-10 rounded-full border border-neutral-200 bg-white px-3 text-sm">
                <option value="">Tipo</option>
                {types.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <select value={colour} onChange={(e) => setColour(e.target.value)} className="h-10 rounded-full border border-neutral-200 bg-white px-3 text-sm">
                <option value="">Color</option>
                {colours.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="h-10 rounded-full border border-neutral-200 bg-white px-3 text-sm">
                <option value="nombre">Nombre</option>
                <option value="precio-asc">Precio ↑</option>
                <option value="precio-desc">Precio ↓</option>
              </select>
            </div>

            <div className="flex flex-wrap gap-1.5">
              <Pill active={!brand} onClick={() => setBrand('')}>Todas</Pill>
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
                    <button type="button" onClick={() => setOpen(item)} className="block w-full text-left">
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
                  const price = sellPrice(item, channel, line.fee);
                  return (
                    <li key={`${line.id}-${line.fee}-${index}`} className="flex items-center gap-3 bg-white p-3">
                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-neutral-100 bg-white">
                        <Photo src={item.image} alt={item.name} className="h-full w-full p-1" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{item.name}</p>
                        <p className="text-[11px] text-neutral-500">{item.colour} · {item.brand}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {(channel === 'b2c' ? FEES : FEES.slice(0, 3)).map((level) => (
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
                      <p className="w-20 text-right text-sm font-semibold tabular-nums">{formatEuro(price == null ? null : price * line.qty)}</p>
                      <button type="button" onClick={() => setPack((current) => current.filter((_, i) => i !== index))} className="p-1 text-neutral-400 hover:text-red-600" aria-label="Quitar del pack">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="rounded-2xl border border-neutral-200 bg-white p-5">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">Total pack</p>
                  <p className="mt-1 font-display text-3xl font-semibold tabular-nums">{formatEuro(totals.sale)}</p>
                  <p className="mt-1 text-sm text-neutral-500">
                    {totals.pieces} prenda{totals.pieces === 1 ? '' : 's'}
                    {totals.margin != null ? ` · margen ${formatPct(totals.margin)}` : ''}
                  </p>
                </div>
                {pack.length > 0 ? (
                  <button type="button" onClick={() => setPack([])} className="text-xs font-semibold text-neutral-500">
                    Vaciar
                  </button>
                ) : null}
              </div>
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
                      {open.brand} · {open.productType}
                    </p>
                    <h3 className="mt-1 font-display text-2xl font-semibold tracking-tight">{open.name}</h3>
                    <p className="mt-1 text-sm text-neutral-500">{open.colour}</p>
                  </div>
                  <button type="button" onClick={() => setOpen(null)} className="rounded-md p-1 text-neutral-400" aria-label="Cerrar">
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <p className="mt-4 text-[11px] uppercase tracking-[0.12em] text-neutral-400">A qué precio</p>
                <div className="mt-2 overflow-hidden rounded-xl border border-neutral-200">
                  <table className="w-full text-sm">
                    <tbody>
                      <tr className="border-b border-neutral-100">
                        <td className="px-3 py-2 text-neutral-500">PVP</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatEuro(rrpPrice(open, channel))}</td>
                      </tr>
                      {(channel === 'b2c' ? FEES : FEES.slice(0, 3)).map((level) => (
                        <tr key={level} className="border-b border-neutral-100 last:border-0">
                          <td className="px-3 py-2 text-neutral-500">Fee {level}</td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatEuro(sellPrice(open, channel, level))}</td>
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
                          onClick={() => setOpen(item)}
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
                  onClick={() => { addToPack(open, fee); setOpen(null); setTab('pack'); }}
                  className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-neutral-900 text-sm font-semibold text-white"
                >
                  <Plus className="h-4 w-4" /> Añadir al pack · Fee {fee}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
