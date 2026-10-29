export const ACCESS_ROLES = ['admin', 'ops', 'comercial'] as const;
export type AccessRole = (typeof ACCESS_ROLES)[number];

export interface AccessUser {
  id: string;
  email: string;
  name: string;
  role: AccessRole;
  active: boolean;
  createdAt: string;
}

export interface AccessOtp {
  email: string;
  hash: string;
  expiresAt: number;
  sentAt: number;
}

export interface AccessDirectory {
  users: AccessUser[];
  otps: AccessOtp[];
}

export const ACCESS_ROLE_LABEL: Record<AccessRole, string> = {
  admin: 'Admin',
  ops: 'Operaciones',
  comercial: 'Comercial',
};

export const ACCESS_ROLE_HINT: Record<AccessRole, string> = {
  admin: 'Todo, incluida la gente.',
  ops: 'Todas las herramientas, sin gente.',
  comercial: 'Solo Tarifas.',
};

export const ACCESS_TOOLS = [
  'dashboard', 'budget', 'tracking', 'stock', 'abonos', 'mejoras',
  'albaranes', 'checklist', 'objetivos', 'estado', 'fraccionar', 'tarifas', 'gente',
] as const;

export type AccessTool = (typeof ACCESS_TOOLS)[number];

export function isAccessRole(value: unknown): value is AccessRole {
  return ACCESS_ROLES.includes(String(value) as AccessRole);
}

export function normalizeEmail(value: string): string {
  return value.trim().toLocaleLowerCase('es');
}

export function canUseTool(role: AccessRole, tool: string): boolean {
  if (role === 'admin') return true;
  if (role === 'ops') return tool !== 'gente';
  return tool === 'tarifas';
}

export function emptyDirectory(): AccessDirectory {
  return { users: [], otps: [] };
}

export function asUser(value: unknown): AccessUser | null {
  const row = (value && typeof value === 'object' ? value : {}) as Partial<AccessUser>;
  const email = normalizeEmail(String(row.email || ''));
  if (!email.includes('@')) return null;
  const role = isAccessRole(row.role) ? row.role : 'comercial';
  return {
    id: String(row.id || email),
    email,
    name: String(row.name || '').trim() || email.split('@')[0],
    role,
    active: row.active !== false,
    createdAt: String(row.createdAt || new Date().toISOString()),
  };
}

export function asDirectory(value: unknown): AccessDirectory {
  const row = (value && typeof value === 'object' ? value : {}) as Partial<AccessDirectory>;
  const users = (Array.isArray(row.users) ? row.users : []).map(asUser).filter((item): item is AccessUser => Boolean(item));
  const seen = new Set<string>();
  const unique = users.filter((item) => {
    if (seen.has(item.email)) return false;
    seen.add(item.email);
    return true;
  });
  const now = Date.now();
  const otps = (Array.isArray(row.otps) ? row.otps : []).filter((item) => (
    item && typeof item === 'object'
    && typeof (item as AccessOtp).email === 'string'
    && typeof (item as AccessOtp).hash === 'string'
    && Number((item as AccessOtp).expiresAt) > now
  )) as AccessOtp[];
  return { users: unique, otps };
}
