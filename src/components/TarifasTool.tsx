'use client';

import { useMemo, useState } from 'react';
import WorkspaceChrome from '@/components/WorkspaceChrome';
import catalog from '@/data/tarifas-catalog.json';
import {
  formatEuro,
  formatQty,
  formatRed,
  isExpired,
  rrpPrice,
  sellPrice,
  todayIso,
  uniqueSorted,
  type TarifaChannel,
  type TarifaProduct,
} from '@/lib/tarifas-model';
import { Search, X } from 'lucide-react';

const PRODUCTS = catalog as TarifaProduct[];
const TABS = [
  { id: 'b2c', label: 'B2C' },
  { id: 'b2b', label: 'B2B' },
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
      <div className={`flex items-center justify-center bg-[var(--bg-soft)] ${className || ''}`}>
        <span className="font-display text-3xl font-semibold tracking-tight text-[var(--text-muted)]/40">
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
      className={`object-contain object-center ${className || ''}`}
    />
  );
}

function StockLine({ item }: { item: TarifaProduct }) {
  const { disp, pending, reserved } = item.stock;
  if (!disp && !pending && !reserved) {
    return <span className="text-[var(--text-muted)]">Sin stock</span>;
  }
  return (
    <span className="text-[var(--text-secondary)]">
      {disp ? `${formatQty(disp)} disp.` : '0 disp.'}
      {pending ? ` · ${formatQty(pending)} en camino` : ''}
    </span>
  );
}

export default function TarifasTool({ onBack }: { onBack: () => void }) {
  const [channel, setChannel] = useState<TarifaChannel>('b2c');
  const [query, setQuery] = useState('');
  const [brand, setBrand] = useState('');
  const [type, setType] = useState('');
  const [onlyExpired, setOnlyExpired] = useState(false);
  const [onlyIncoming, setOnlyIncoming] = useState(false);
  const [open, setOpen] = useState<TarifaProduct | null>(null);
  const today = todayIso();

  const brands = useMemo(() => uniqueSorted(PRODUCTS, 'brand'), []);
  const types = useMemo(() => uniqueSorted(PRODUCTS, 'productType'), []);

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('es');
    return PRODUCTS.filter((item) => {
      if (brand && item.brand !== brand) return false;
      if (type && item.productType !== type) return false;
      if (onlyExpired && !isExpired(item.red, today)) return false;
      if (onlyIncoming && item.stock.pending <= 0) return false;
      if (q) {
        const hay = `${item.brand} ${item.productType} ${item.name} ${item.colour} ${item.adultRef} ${item.youthRef}`.toLocaleLowerCase('es');
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [brand, onlyExpired, onlyIncoming, query, today, type]);

  const price = (item: TarifaProduct) => sellPrice(item, channel);
  const list = (item: TarifaProduct) => rrpPrice(item, channel);

  return (
    <div className="space-y-6">
      <WorkspaceChrome
        onBack={onBack}
        tabs={[...TABS]}
        active={channel}
        onSelect={(id) => setChannel(id as TarifaChannel)}
      />

      <section className="relative overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--bg-card)] px-6 py-7 sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">12 Tarifas</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-4xl font-semibold tracking-tight">Temporada 26/27</h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--text-secondary)]">
              Lo programado para vender. Foto, vigencia, stock y precio {channel.toUpperCase()} en cada ficha.
            </p>
          </div>
          <p className="text-sm tabular-nums text-[var(--text-muted)]">
            {filtered.length.toLocaleString('es-ES')} de {PRODUCTS.length.toLocaleString('es-ES')}
          </p>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar producto, color o referencia"
            className="h-11 w-full rounded-full border border-[var(--border)] bg-[var(--bg-card)] py-0 pl-10 pr-4 text-sm outline-none focus:border-[var(--border-strong)]"
          />
        </label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="h-11 rounded-full border border-[var(--border)] bg-[var(--bg-card)] px-4 text-sm"
        >
          <option value="">Tipo</option>
          {types.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setOnlyIncoming((value) => !value)}
          className={`h-11 rounded-full border px-4 text-xs font-semibold ${
            onlyIncoming
              ? 'border-[var(--text-primary)] bg-[var(--text-primary)] text-white'
              : 'border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-secondary)]'
          }`}
        >
          En camino
        </button>
        <button
          type="button"
          onClick={() => setOnlyExpired((value) => !value)}
          className={`h-11 rounded-full border px-4 text-xs font-semibold ${
            onlyExpired
              ? 'border-red-300 bg-red-50 text-red-800'
              : 'border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-secondary)]'
          }`}
        >
          Caducadas
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setBrand('')}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
            !brand ? 'bg-[var(--text-primary)] text-white' : 'bg-[var(--bg-card)] text-[var(--text-secondary)] ring-1 ring-[var(--border)]'
          }`}
        >
          Todas
        </button>
        {brands.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setBrand(item === brand ? '' : item)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              brand === item ? 'bg-[var(--text-primary)] text-white' : 'bg-[var(--bg-card)] text-[var(--text-secondary)] ring-1 ring-[var(--border)]'
            }`}
          >
            {item}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="py-16 text-center text-sm text-[var(--text-muted)]">Ningún producto con estos filtros.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          {filtered.map((item) => {
            const expired = isExpired(item.red, today);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setOpen(item)}
                className="group overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] text-left transition hover:-translate-y-0.5 hover:border-[var(--border-strong)]"
              >
                <div className="aspect-[4/5] bg-[#f3f1ec]">
                  <Photo key={item.image || item.id} src={item.image} alt={item.name} className="h-full w-full p-4 transition duration-300 group-hover:scale-[1.03]" />
                </div>
                <div className="space-y-2 px-4 pb-4 pt-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                    {item.brand} · {item.productType}
                  </p>
                  <p className="font-display text-[15px] font-semibold leading-snug tracking-tight">{item.name}</p>
                  <p className="text-xs text-[var(--text-secondary)]">{item.colour}</p>
                  <div className="flex items-baseline justify-between gap-2 pt-1">
                    <p className="font-display text-lg font-semibold tabular-nums">{formatEuro(price(item))}</p>
                    <p className="text-[11px] tabular-nums text-[var(--text-muted)]">PVP {formatEuro(list(item))}</p>
                  </div>
                  <p className="text-[11px]">
                    <StockLine item={item} />
                    {expired ? <span className="ml-2 font-semibold text-[var(--danger)]">Caducada</span> : null}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {open ? (
        <div className="abonos-modal-backdrop" onClick={() => setOpen(null)}>
          <div
            className="abonos-modal overflow-hidden"
            style={{ width: 'min(980px, 100%)' }}
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="grid md:grid-cols-[1.05fr_1fr]">
              <div className="bg-[#f3f1ec] p-6 md:min-h-[560px]">
                <Photo key={open.image || open.id} src={open.image} alt={open.name} className="mx-auto h-full max-h-[640px] w-full" />
              </div>
              <div className="flex flex-col p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                      {open.brand} · {open.productType}
                    </p>
                    <h3 className="mt-1 font-display text-2xl font-semibold tracking-tight">{open.name}</h3>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">{open.colour}</p>
                  </div>
                  <button type="button" onClick={() => setOpen(null)} className="rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--bg-soft)]" aria-label="Cerrar">
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <dl className="mt-6 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)]">Adulto</dt>
                    <dd className="mt-0.5 font-medium tabular-nums">{open.adultRef || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)]">Niño</dt>
                    <dd className="mt-0.5 font-medium tabular-nums">{open.youthRef || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)]">Vigencia</dt>
                    <dd className={`mt-0.5 font-medium ${isExpired(open.red, today) ? 'text-[var(--danger)]' : ''}`}>
                      {formatRed(open.red)}
                      {isExpired(open.red, today) ? ' · caducada' : ''}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)]">Stock</dt>
                    <dd className="mt-0.5"><StockLine item={open} /></dd>
                  </div>
                </dl>

                <div className="mt-5 grid grid-cols-2 gap-2 text-[12px] text-[var(--text-secondary)]">
                  <p>EQI {formatQty(open.stock.eqi)}</p>
                  <p>ZTT {formatQty(open.stock.ztt)}</p>
                  <p>ZGZ {formatQty(open.stock.zgz)}</p>
                  <p>B2B {formatQty(open.stock.b2b)}</p>
                  <p>Reservado {formatQty(open.stock.reserved)}</p>
                  <p>Total {formatQty(open.stock.total)}</p>
                </div>

                <div className="mt-6 overflow-hidden rounded-xl border border-[var(--border)]">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-[var(--bg-soft)] text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
                      <tr>
                        <th className="px-3 py-2 font-semibold"> </th>
                        <th className="px-3 py-2 font-semibold">Adulto</th>
                        <th className="px-3 py-2 font-semibold">Niño</th>
                      </tr>
                    </thead>
                    <tbody>
                      {channel === 'b2c' ? (
                        <>
                          <tr className="border-t border-[var(--border)]">
                            <td className="px-3 py-2 text-[var(--text-secondary)]">PVP</td>
                            <td className="px-3 py-2 tabular-nums">{formatEuro(open.b2c.adultRrp)}</td>
                            <td className="px-3 py-2 tabular-nums">{formatEuro(open.b2c.youthRrp)}</td>
                          </tr>
                          {([
                            ['Fee 1', open.b2c.fee1],
                            ['Fee 2', open.b2c.fee2],
                            ['Fee 3', open.b2c.fee3],
                            ['Fee 4', open.b2c.fee4],
                          ] as const).map(([label, value]) => (
                            <tr key={label} className="border-t border-[var(--border)]">
                              <td className="px-3 py-2 text-[var(--text-secondary)]">{label}</td>
                              <td className="px-3 py-2 tabular-nums font-medium" colSpan={2}>{formatEuro(value)}</td>
                            </tr>
                          ))}
                        </>
                      ) : (
                        <>
                          <tr className="border-t border-[var(--border)]">
                            <td className="px-3 py-2 text-[var(--text-secondary)]">PVP</td>
                            <td className="px-3 py-2 tabular-nums">{formatEuro(open.b2b.adultRrp)}</td>
                            <td className="px-3 py-2 tabular-nums">{formatEuro(open.b2b.youthRrp)}</td>
                          </tr>
                          {([
                            ['Fee 1', open.b2b.adultFee1, open.b2b.youthFee1],
                            ['Fee 2', open.b2b.adultFee2, open.b2b.youthFee2],
                            ['Fee 3', open.b2b.adultFee3, open.b2b.youthFee3],
                          ] as const).map(([label, adult, youth]) => (
                            <tr key={label} className="border-t border-[var(--border)]">
                              <td className="px-3 py-2 text-[var(--text-secondary)]">{label}</td>
                              <td className="px-3 py-2 tabular-nums font-medium">{formatEuro(adult)}</td>
                              <td className="px-3 py-2 tabular-nums">{formatEuro(youth)}</td>
                            </tr>
                          ))}
                        </>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
