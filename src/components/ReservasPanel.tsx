'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  applyShortcut,
  buildCurves,
  emptyReservaLine,
  hydrateLine,
  isOnesizeProduct,
  resolveCurve,
  setCellQty,
  type ReservaLine,
  type ReservaSizeCell,
  type ReservasCatalog,
} from '@/lib/reservas-model';
import { reservaRpExportRows } from '@/lib/reservas-excel';
import { readReservaDraft, writeReservaDraft } from '@/lib/reservas-store';
import { type PackLine, type TarifaProduct } from '@/lib/tarifas-model';
import { labelProductType, type TarifasCopy, type TarifasLocale } from '@/lib/tarifas-i18n';
import { PhotoLightbox, TarifasPhoto } from '@/components/TarifasPhoto';
import { Download, Plus, Trash2 } from 'lucide-react';

function SizeRow({
  cells,
  onChange,
}: {
  cells: ReservaSizeCell[];
  onChange: (size: string, qty: number) => void;
}) {
  if (!cells.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {cells.map((cell) => (
        <label key={cell.size} className={`min-w-[4.5rem] rounded-xl border px-2 py-1.5 ${cell.locked ? 'border-neutral-900' : 'border-neutral-200'}`}>
          <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-400">{cell.size}</span>
          <input
            inputMode="numeric"
            value={cell.qty}
            onChange={(event) => onChange(cell.size, Number(event.target.value) || 0)}
            className="w-full bg-transparent text-sm font-semibold tabular-nums outline-none"
          />
        </label>
      ))}
    </div>
  );
}

export default function ReservasPanel({
  products,
  pack,
  catalog,
  copy,
  locale,
}: {
  products: TarifaProduct[];
  pack: PackLine[];
  catalog: ReservasCatalog;
  copy: TarifasCopy;
  locale: TarifasLocale;
}) {
  const [lines, setLines] = useState<ReservaLine[]>([]);
  const [players, setPlayers] = useState(0);
  const [mixAdult, setMixAdult] = useState(70);
  const [query, setQuery] = useState('');
  const [zoom, setZoom] = useState<{ src: string; alt: string } | null>(null);

  const byId = useMemo(() => new Map(products.map((item) => [item.id, item])), [products]);
  const curves = useMemo(() => buildCurves(catalog, products), [catalog, products]);

  useEffect(() => {
    const draft = readReservaDraft();
    setPlayers(draft.players);
    setMixAdult(draft.mixAdult || 70);
    const next = (draft.lines.length ? draft.lines : draft.lineIds.map((id) => ({ id, adultQty: 0, youthQty: 0, onesizeQty: 0 })))
      .filter((row) => byId.has(row.id))
      .map((row) => {
        const item = byId.get(row.id);
        if (!item) return emptyReservaLine(row.id);
        return hydrateLine({
          ...emptyReservaLine(row.id),
          adultQty: row.adultQty,
          youthQty: row.youthQty,
          onesizeQty: row.onesizeQty,
        }, item, catalog, products, curves);
      });
    setLines(next);
    // First hydrate from saved draft only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setLines((current) => current.map((line) => {
      const item = byId.get(line.id);
      return item ? hydrateLine(line, item, catalog, products, curves) : line;
    }));
  }, [byId, catalog, curves, products]);

  useEffect(() => {
    writeReservaDraft({
      players,
      mixAdult,
      lineIds: lines.map((line) => line.id),
      lines: lines.map((line) => ({
        id: line.id,
        adultQty: line.adultQty,
        youthQty: line.youthQty,
        onesizeQty: line.onesizeQty,
      })),
    });
  }, [lines, mixAdult, players]);

  const addProduct = (item: TarifaProduct) => {
    setLines((current) => {
      if (current.some((line) => line.id === item.id)) return current;
      return [...current, hydrateLine(emptyReservaLine(item.id), item, catalog, products, curves)];
    });
  };

  const fromPack = () => {
    const extra = pack
      .map((line) => byId.get(line.id))
      .filter((item): item is TarifaProduct => Boolean(item))
      .filter((item) => !lines.some((line) => line.id === item.id));
    if (!extra.length) return;
    setLines((current) => [
      ...current,
      ...extra.map((item) => hydrateLine(emptyReservaLine(item.id), item, catalog, products, curves)),
    ]);
  };

  const updateLine = (id: string, patch: (line: ReservaLine, item: TarifaProduct) => ReservaLine) => {
    setLines((current) => current.map((line) => {
      if (line.id !== id) return line;
      const item = byId.get(line.id);
      if (!item) return line;
      return patch(line, item);
    }));
  };

  const download = async () => {
    const XLSX = await import('xlsx');
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(reservaRpExportRows(lines, products)), 'Reservas');
    XLSX.writeFile(workbook, 'Hoja_reservas_RP.xlsx');
  };

  const hits = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('es');
    if (q.length < 2) return [];
    return products.filter((item) => {
      if (lines.some((line) => line.id === item.id)) return false;
      const hay = `${item.brand} ${item.productType} ${item.name} ${item.colour} ${item.adultRef} ${item.youthRef}`.toLocaleLowerCase('es');
      return hay.includes(q);
    }).slice(0, 8);
  }, [lines, products, query]);

  const sourceLabel = (item: TarifaProduct, band: 'adult' | 'youth' | 'onesize') => {
    if (isOnesizeProduct(item, catalog.onesizeTypes)) return copy.reservasOnesize;
    const resolved = resolveCurve(catalog, products, item, band, curves);
    if (resolved.source === 'sku') return copy.reservasSourceSku;
    if (resolved.source === 'family') return copy.reservasSourceFamily;
    if (resolved.source === 'template') return copy.reservasSourceTemplate;
    return copy.reservasNoCurve;
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <p className="text-sm text-neutral-500">{copy.reservasHint}</p>
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-neutral-200 p-4">
        <label>
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-400">{copy.reservasPlayers}</span>
          <input
            inputMode="numeric"
            value={players || ''}
            onChange={(event) => setPlayers(Number(event.target.value) || 0)}
            className="h-10 w-28 rounded-lg border border-neutral-200 px-3 text-sm tabular-nums outline-none"
          />
        </label>
        <label>
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-400">{copy.reservasMixAdult}</span>
          <input
            inputMode="numeric"
            value={mixAdult}
            onChange={(event) => setMixAdult(Math.min(100, Math.max(0, Number(event.target.value) || 0)))}
            className="h-10 w-24 rounded-lg border border-neutral-200 px-3 text-sm tabular-nums outline-none"
          />
        </label>
        <button
          type="button"
          onClick={() => setLines((current) => applyShortcut(current, products, catalog, players, mixAdult))}
          className="h-10 rounded-full bg-neutral-900 px-4 text-xs font-semibold text-white"
        >
          {copy.reservasFill}
        </button>
        <button type="button" onClick={fromPack} className="h-10 rounded-full border border-neutral-200 px-4 text-xs font-semibold">
          {copy.reservasFromPack}
        </button>
        {lines.length > 0 ? (
          <>
            <button type="button" onClick={download} className="inline-flex h-10 items-center gap-2 rounded-full border border-neutral-200 px-4 text-xs font-semibold">
              <Download className="h-4 w-4" /> {copy.reservasExport}
            </button>
            <button type="button" onClick={() => setLines([])} className="h-10 text-xs font-semibold text-neutral-500">{copy.reservasClear}</button>
          </>
        ) : null}
      </div>

      <label className="block">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={copy.search}
          className="h-10 w-full rounded-full border border-neutral-200 px-4 text-sm outline-none"
        />
      </label>
      {hits.length > 0 ? (
        <ul className="divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-neutral-200">
          {hits.map((item) => (
            <li key={item.id}>
              <button type="button" onClick={() => { addProduct(item); setQuery(''); }} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-neutral-50">
                <span className="h-10 w-10 overflow-hidden rounded-md bg-neutral-50">
                  <TarifasPhoto src={item.image} alt={item.name} className="h-full w-full p-1" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{item.name}</span>
                  <span className="block text-[11px] text-neutral-400">{item.brand} · {labelProductType(locale, item.productType)} · {item.colour}</span>
                </span>
                <Plus className="h-4 w-4 text-neutral-400" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {lines.length === 0 ? (
        <p className="py-16 text-center text-sm text-neutral-400">{copy.reservasEmpty}</p>
      ) : (
        <div className="space-y-3">
          {lines.map((line) => {
            const item = byId.get(line.id);
            if (!item) return null;
            const onesize = isOnesizeProduct(item, catalog.onesizeTypes);
            return (
              <article key={line.id} className="rounded-2xl border border-neutral-200 p-4">
                <div className="flex gap-3">
                  <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-neutral-50">
                    <TarifasPhoto
                      src={item.image}
                      alt={item.name}
                      className="h-full w-full p-1.5"
                      onOpen={item.image ? (src, alt) => setZoom({ src, alt }) : undefined}
                    />
                  </div>
                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
                          {item.brand} · {labelProductType(locale, item.productType)}
                        </p>
                        <p className="font-semibold leading-snug">{item.name}</p>
                        <p className="text-[11px] text-neutral-500">{item.colour}</p>
                      </div>
                      <button type="button" onClick={() => setLines((current) => current.filter((row) => row.id !== line.id))} className="p-1 text-neutral-400 hover:text-red-600" aria-label={copy.reservasClear}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    {onesize ? (
                      <div className="space-y-2">
                        <label className="inline-block">
                          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-400">{copy.reservasQty}</span>
                          <input
                            inputMode="numeric"
                            value={line.onesizeQty || ''}
                            onChange={(event) => updateLine(line.id, (current, product) => hydrateLine({
                              ...current,
                              onesizeQty: Number(event.target.value) || 0,
                            }, product, catalog, products, curves))}
                            className="h-10 w-28 rounded-lg border border-neutral-200 px-3 text-sm tabular-nums outline-none"
                          />
                        </label>
                        <p className="text-[11px] text-neutral-400">{copy.reservasOnesize}</p>
                        <SizeRow
                          cells={line.onesizeSizes}
                          onChange={(size, qty) => updateLine(line.id, (current) => ({
                            ...current,
                            onesizeSizes: setCellQty(current.onesizeSizes, size, qty, current.onesizeQty, resolveCurve(catalog, products, item, 'onesize', curves).curve),
                          }))}
                        />
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {item.adultRef ? (
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-end gap-3">
                              <label>
                                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-400">{copy.reservasAdultQty}</span>
                                <input
                                  inputMode="numeric"
                                  value={line.adultQty || ''}
                                  onChange={(event) => updateLine(line.id, (current, product) => hydrateLine({
                                    ...current,
                                    adultQty: Number(event.target.value) || 0,
                                    adultSizes: current.adultSizes.map((cell) => ({ ...cell, locked: false })),
                                  }, product, catalog, products, curves))}
                                  className="h-10 w-28 rounded-lg border border-neutral-200 px-3 text-sm tabular-nums outline-none"
                                />
                              </label>
                              <p className="pb-2 font-mono text-[11px] text-neutral-400">{item.adultRef}</p>
                              {line.adultSizes.length ? (
                                <p className="pb-2 text-[11px] text-neutral-400">{sourceLabel(item, 'adult')}</p>
                              ) : null}
                            </div>
                            {line.adultSizes.length ? (
                              <SizeRow
                                cells={line.adultSizes}
                                onChange={(size, qty) => updateLine(line.id, (current) => ({
                                  ...current,
                                  adultSizes: setCellQty(current.adultSizes, size, qty, current.adultQty, resolveCurve(catalog, products, item, 'adult', curves).curve),
                                }))}
                              />
                            ) : (
                              <p className="text-[11px] text-amber-700">{copy.reservasNoCurve}</p>
                            )}
                          </div>
                        ) : null}
                        {item.youthRef ? (
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-end gap-3">
                              <label>
                                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-400">{copy.reservasYouthQty}</span>
                                <input
                                  inputMode="numeric"
                                  value={line.youthQty || ''}
                                  onChange={(event) => updateLine(line.id, (current, product) => hydrateLine({
                                    ...current,
                                    youthQty: Number(event.target.value) || 0,
                                    youthSizes: current.youthSizes.map((cell) => ({ ...cell, locked: false })),
                                  }, product, catalog, products, curves))}
                                  className="h-10 w-28 rounded-lg border border-neutral-200 px-3 text-sm tabular-nums outline-none"
                                />
                              </label>
                              <p className="pb-2 font-mono text-[11px] text-neutral-400">{item.youthRef}</p>
                              {line.youthSizes.length ? (
                                <p className="pb-2 text-[11px] text-neutral-400">{sourceLabel(item, 'youth')}</p>
                              ) : null}
                            </div>
                            {line.youthSizes.length ? (
                              <SizeRow
                                cells={line.youthSizes}
                                onChange={(size, qty) => updateLine(line.id, (current) => ({
                                  ...current,
                                  youthSizes: setCellQty(current.youthSizes, size, qty, current.youthQty, resolveCurve(catalog, products, item, 'youth', curves).curve),
                                }))}
                              />
                            ) : (
                              <p className="text-[11px] text-amber-700">{copy.reservasNoCurve}</p>
                            )}
                          </div>
                        ) : null}
                        {!item.adultRef && !item.youthRef ? <p className="text-[11px] text-amber-700">{copy.reservasNoCurve}</p> : null}
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
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
