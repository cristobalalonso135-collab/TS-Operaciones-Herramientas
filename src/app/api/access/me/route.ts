import { NextResponse } from 'next/server';
import { currentSession, mailConfigured } from '@/lib/access-session';
import { loadAccessDirectory } from '@/lib/access-store';

export async function GET() {
  const session = currentSession();
  const loaded = await loadAccessDirectory().catch(() => ({ directory: { users: [], otps: [] }, setupSql: undefined }));
  return NextResponse.json({
    user: session ? { email: session.email, name: session.name, role: session.role } : null,
    mail: mailConfigured(),
    empty: loaded.directory.users.length === 0,
    setupSql: loaded.setupSql,
  });
}
