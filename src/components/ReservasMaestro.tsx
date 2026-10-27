'use client';

import FileUpload from '@/components/FileUpload';
import { newId, uniqueSorted, type TarifaProduct } from '@/lib/tarifas-model';
import { parseReservaSalesSheets } from '@/lib/reservas-excel';
import {
  FAMILY_CURVE_MIN,
  SKU_CURVE_MIN,
  asReservasCatalog,
  buildCurves,
  proposeGrids,
  type ReservaBand,
  type ReservasCatalog,
  type SizeGrid,
} from '@/lib/reservas-model';
import type { TarifasCopy } from '@/lib/tarifas-i18n';
import { Plus, Trash2 } from 'lucide-react';

export default function ReservasMaestro({
  products,
  catalog,
  copy,
  localeTag,
  setupSql,
  onChange,
}: {
  products: TarifaProduct[];
  catalog: ReservasCatalog;
  copy: TarifasCopy;
  localeTag: string;
  setupSql?: string;
  onChange: (next: ReservasCatalog) => void;
}) {
  const types = uniqueSorted(products, 'productType');
  const brands = uniqueSorted(products, 'brand');
  const curves = buildCurves(catalog, products);

  const patch = (partial: Partial<ReservasCatalog>) => onChange(asReservasCatalog({ ...catalog, ...partial }));

  const setGrid = (id: string, next: Partial<SizeGrid>) => {
    patch({
      grids: catalog.grids.map((grid) => (grid.id === id ? { ...grid, ...next } : grid)),
    });
  };

  return (
    <div className="space-y-4 rounded-2xl border border-neutral-200 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">{copy.reservas}</p>
      <p className="text-sm text-neutral-500">{copy.reservasSalesHint}</p>
      <FileUpload
        label={copy.reservasSalesUpload}
        hint={copy.reservasSalesHint}
        inputId="reservas-sales"
        compact
        onFileLoaded={() => undefined}
        onWorkbookLoaded={(sheets) => {
          const sales = parseReservaSalesSheets(sheets);
          patch({ sales });
        }}
      />
      <p className="text-xs text-neutral-500">
        {catalog.sales.length
          ? `${catalog.sales.length.toLocaleString(localeTag)} ${copy.reservasSalesImported} · SKU ≥ ${SKU_CURVE_MIN}: ${curves.sku.size} · ${copy.reservasSourceFamily} ≥ ${FAMILY_CURVE_MIN}: ${curves.family.size}`
          : copy.reservasNoSales}
      </p>
      {setupSql ? <p className="text-xs text-amber-700">{copy.reservasSetupSql}</p> : null}

      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">{copy.reservasOnesizeTypes}</p>
        <div className="flex flex-wrap gap-1.5">
          {types.map((type) => {
            const on = catalog.onesizeTypes.includes(type);
            return (
              <button
                key={type}
                type="button"
                onClick={() => patch({
                  onesizeTypes: on
                    ? catalog.onesizeTypes.filter((item) => item !== type)
                    : [...catalog.onesizeTypes, type],
                })}
                className={`h-8 rounded-full border px-3 text-[11px] font-semibold ${
                  on ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 text-neutral-600'
                }`}
              >
                {type}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">{copy.reservasGrids}</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              const extra = proposeGrids(catalog, products);
              if (extra.length) patch({ grids: [...catalog.grids, ...extra] });
            }}
            className="h-8 rounded-full border border-neutral-200 px-3 text-[11px] font-semibold"
          >
            {copy.reservasProposeGrids}
          </button>
          <button
            type="button"
            onClick={() => patch({
              grids: [...catalog.grids, {
                id: newId('grid'),
                brand: brands[0] || '',
                productType: types[0] || '',
                band: 'adult',
                sizes: [],
              }],
            })}
            className="inline-flex h-8 items-center gap-1 rounded-full bg-neutral-900 px-3 text-[11px] font-semibold text-white"
          >
            <Plus className="h-3.5 w-3.5" /> {copy.reservasAddGrid}
          </button>
        </div>
      </div>
      <p className="text-xs text-neutral-500">{copy.reservasGridsHint}</p>
      <div className="space-y-2">
        {catalog.grids.map((grid) => (
          <div key={grid.id} className="grid gap-2 rounded-xl border border-neutral-100 p-2 sm:grid-cols-[8rem_8rem_7rem_1fr_auto]">
            <select
              value={grid.brand}
              onChange={(event) => setGrid(grid.id, { brand: event.target.value })}
              className="h-9 rounded-lg border border-neutral-200 px-2 text-xs"
            >
              {brands.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <select
              value={grid.productType}
              onChange={(event) => setGrid(grid.id, { productType: event.target.value })}
              className="h-9 rounded-lg border border-neutral-200 px-2 text-xs"
            >
              {types.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <select
              value={grid.band}
              onChange={(event) => setGrid(grid.id, { band: event.target.value as ReservaBand })}
              className="h-9 rounded-lg border border-neutral-200 px-2 text-xs"
            >
              <option value="adult">{copy.reservasBandAdult}</option>
              <option value="youth">{copy.reservasBandYouth}</option>
              <option value="onesize">{copy.reservasBandOnesize}</option>
            </select>
            <input
              value={grid.sizes.join(', ')}
              onChange={(event) => setGrid(grid.id, {
                sizes: event.target.value.split(',').map((item) => item.trim()).filter(Boolean),
              })}
              placeholder="S, M, L, XL"
              className="h-9 rounded-lg border border-neutral-200 px-2 text-xs outline-none"
            />
            <button
              type="button"
              onClick={() => patch({ grids: catalog.grids.filter((item) => item.id !== grid.id) })}
              className="grid h-9 w-9 place-items-center text-neutral-400 hover:text-red-600"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
