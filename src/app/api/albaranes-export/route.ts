import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';

type Row = Record<string, string | number>;

const DETALLE_COLS = [
  'FechaEjecucion', 'ReglaId', 'IdAlbaran', 'Albaran', 'Serie', 'Estado', 'FechaEstado',
  'DiasEstado', 'AgenteOriginal', 'CodigoColectivo', 'AgenteResuelto', 'Email',
  'PrimeraFechaIncumplimiento', 'DiasIncumpliendo', 'NumeroNotificaciones', 'Mensaje', 'ClaveUnicaAccion',
] as const;

const CORREO_COLS = [
  'FechaEjecucion', 'AgenteResuelto', 'Email', 'Asunto', 'CuerpoHTML', 'NumeroAlbaranes', 'ClaveUnicaEnvio', 'Enviar',
] as const;

function addTable(sheet: ExcelJS.Worksheet, name: string, columns: readonly string[], rows: Row[]) {
  columns.forEach((header, index) => {
    sheet.getColumn(index + 1).width = Math.min(36, Math.max(14, header.length + 4));
  });
  const dataRows = rows.length > 0
    ? rows.map((row) => columns.map((col) => row[col] ?? ''))
    : [columns.map(() => '')];
  sheet.addTable({
    name,
    ref: 'A1',
    headerRow: true,
    totalsRow: false,
    style: { theme: 'TableStyleMedium2', showRowStripes: true },
    columns: columns.map((col) => ({ name: col, filterButton: true })),
    rows: dataRows,
  });
}

export async function POST(request: Request) {
  const body = await request.json() as { detalle?: Row[]; correos?: Row[]; fileName?: string };
  const detalle = Array.isArray(body.detalle) ? body.detalle : [];
  const correos = Array.isArray(body.correos) ? body.correos : [];
  const fileName = String(body.fileName || 'albaranes_acciones.xlsx').replace(/[^\w.\-]+/g, '_');

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TS Operaciones';
  addTable(workbook.addWorksheet('DetalleAcciones'), 'DetalleAcciones', DETALLE_COLS, detalle);
  addTable(workbook.addWorksheet('Correos'), 'Correos', CORREO_COLS, correos);

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  });
}
