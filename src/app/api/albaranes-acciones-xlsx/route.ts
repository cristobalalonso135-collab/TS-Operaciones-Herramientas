import { NextResponse } from 'next/server';
import { workbookTableBuffer } from '@/lib/albaranes-excel-table';

export async function POST(request: Request) {
  const body = await request.json() as {
    fileName?: string;
    sheetName?: string;
    tableName?: string;
    header?: unknown[];
    rows?: unknown[][];
  };
  const header = Array.isArray(body.header) ? body.header.map((item) => String(item ?? '')) : [];
  if (header.length === 0) {
    return NextResponse.json({ error: 'Sin columnas' }, { status: 400 });
  }
  const rows = Array.isArray(body.rows)
    ? body.rows.map((row) => (Array.isArray(row) ? row.map((cell) => (typeof cell === 'number' ? cell : String(cell ?? ''))) : []))
    : [];
  const fileName = String(body.fileName || 'albaranes_acciones.xlsx').replace(/[^\w.\-]+/g, '_');
  const buffer = await workbookTableBuffer({
    sheetName: String(body.sheetName || 'Acciones'),
    tableName: String(body.tableName || 'AlbaranesAcciones'),
    header,
    rows,
  });
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  });
}
