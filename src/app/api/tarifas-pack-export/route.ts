import { NextResponse } from 'next/server';
import { renderPackExcel, renderPackPptx } from '@/lib/tarifas-pack-deck';
import type { PackDeck, PackDeckFormat } from '@/lib/tarifas-pack-payload';

function isDeck(value: unknown): value is PackDeck {
  if (!value || typeof value !== 'object') return false;
  const deck = value as PackDeck;
  return typeof deck.title === 'string' && Array.isArray(deck.lines) && Boolean(deck.labels) && Boolean(deck.totals);
}

export async function POST(request: Request) {
  const body = await request.json() as { format?: PackDeckFormat; deck?: unknown };
  const format: PackDeckFormat = body.format === 'pptx' ? 'pptx' : 'xlsx';
  if (!isDeck(body.deck) || body.deck.lines.length === 0) {
    return NextResponse.json({ error: 'empty' }, { status: 400 });
  }
  const deck = {
    ...body.deck,
    lines: body.deck.lines.slice(0, 40),
  };
  const buffer = format === 'pptx' ? await renderPackPptx(deck) : await renderPackExcel(deck);
  const slug = String(deck.fileSlug || 'Pack').replace(/[^\w.-]+/g, '_').slice(0, 80);
  const filename = `${slug}.${format === 'pptx' ? 'pptx' : 'xlsx'}`;
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': format === 'pptx'
        ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
