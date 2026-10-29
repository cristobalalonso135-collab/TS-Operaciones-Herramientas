import { NextResponse } from 'next/server';
import { asUser, type AccessUser } from '@/lib/access-model';
import { requireAdminSession } from '@/lib/access-session';
import { loadAccessDirectory, saveAccessDirectory } from '@/lib/access-store';

function requireAdmin() {
  return requireAdminSession();
}

export async function GET() {
  if (!requireAdmin()) return NextResponse.json({ error: 'No.' }, { status: 401 });
  const loaded = await loadAccessDirectory();
  return NextResponse.json({
    users: loaded.directory.users,
    setupSql: loaded.setupSql,
  });
}

export async function PUT(request: Request) {
  if (!requireAdmin()) return NextResponse.json({ error: 'No.' }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { users?: unknown };
  const users = (Array.isArray(body.users) ? body.users : []).map(asUser).filter((item): item is AccessUser => Boolean(item));
  const loaded = await loadAccessDirectory();
  try {
    await saveAccessDirectory({ ...loaded.directory, users });
  } catch {
    return NextResponse.json({ error: 'Falta crear la tabla access_store en Supabase.' }, { status: 500 });
  }
  return NextResponse.json({ users });
}
