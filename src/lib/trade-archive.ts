import { supabase } from '@/lib/supabase';

export const TRADE_ARCHIVE_BUCKET = 'trade-terms';
export const TRADE_ARCHIVE_MAX_BYTES = 25 * 1024 * 1024;

export const TRADE_ARCHIVE_SETUP_SQL = `INSERT INTO storage.buckets (id, name, public)
VALUES ('${TRADE_ARCHIVE_BUCKET}', '${TRADE_ARCHIVE_BUCKET}', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS trade_terms_read ON storage.objects;
DROP POLICY IF EXISTS trade_terms_insert ON storage.objects;
DROP POLICY IF EXISTS trade_terms_delete ON storage.objects;

CREATE POLICY trade_terms_read ON storage.objects FOR SELECT USING (bucket_id = '${TRADE_ARCHIVE_BUCKET}');
CREATE POLICY trade_terms_insert ON storage.objects FOR INSERT WITH CHECK (bucket_id = '${TRADE_ARCHIVE_BUCKET}');
CREATE POLICY trade_terms_delete ON storage.objects FOR DELETE USING (bucket_id = '${TRADE_ARCHIVE_BUCKET}');`;

export const ARCHIVE_FORMS = ['Credit note', 'Producto', 'En factura', 'Otro'] as const;
export type ArchiveForm = (typeof ARCHIVE_FORMS)[number];

export interface ArchiveCompany {
  id: string;
  name: string;
  /** Month (1-12) in which the company's fiscal year starts. */
  fyStartMonth: number;
}

export interface ArchiveRow {
  id: string;
  agreement: string;
  concept: string;
  rate: string;
  base: string;
  payment: string;
  form: ArchiveForm | '';
}

export interface ArchiveFile {
  id: string;
  kind: 'doc' | 'shot';
  name: string;
  mime: string;
  size: number;
  path: string;
  addedAt: string;
}

export interface ArchiveFolder {
  id: string;
  companyId: string;
  /** Fiscal year, named by the calendar year in which it ends (FY27 = 2027). */
  fy: number;
  rows: ArchiveRow[];
  files: ArchiveFile[];
}

export interface TradeArchive {
  companies: ArchiveCompany[];
  folders: ArchiveFolder[];
}

const SEED_COMPANIES: Array<Omit<ArchiveCompany, 'id'>> = [
  { name: 'Adidas', fyStartMonth: 1 },
  { name: 'Nike', fyStartMonth: 6 },
  { name: 'Aneyron', fyStartMonth: 7 },
  { name: 'Stahls', fyStartMonth: 1 },
];

export const DEFAULT_FYS = [2026, 2027];

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function monthLabel(month: number): string {
  return MONTHS[(month - 1 + 12) % 12];
}

export function fyRangeLabel(company: ArchiveCompany): string {
  const start = company.fyStartMonth;
  const end = start === 1 ? 12 : start - 1;
  return `${monthLabel(start)} – ${monthLabel(end)}`;
}

function lastDay(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function fyDates(company: ArchiveCompany, fy: number): string {
  const start = company.fyStartMonth;
  const startYear = start === 1 ? fy : fy - 1;
  const endMonth = start === 1 ? 12 : start - 1;
  return `1 ${monthLabel(start)} ${startYear} – ${lastDay(fy, endMonth)} ${monthLabel(endMonth)} ${fy}`;
}

export function fyLabel(fy: number): string {
  return `FY${String(fy).slice(-2)}`;
}

export function emptyArchive(): TradeArchive {
  return {
    companies: SEED_COMPANIES.map((company) => ({ ...company, id: crypto.randomUUID() })),
    folders: [],
  };
}

export function normalizeArchive(value: unknown): TradeArchive {
  if (!value || typeof value !== 'object') return emptyArchive();
  const raw = value as Partial<TradeArchive>;
  const companies = Array.isArray(raw.companies)
    ? raw.companies
      .filter((item) => item && typeof item.id === 'string' && typeof item.name === 'string')
      .map((item) => ({
        id: item.id,
        name: item.name.trim(),
        fyStartMonth: Number.isInteger(item.fyStartMonth) && item.fyStartMonth >= 1 && item.fyStartMonth <= 12 ? item.fyStartMonth : 1,
      }))
    : [];
  const folders = Array.isArray(raw.folders)
    ? raw.folders
      .filter((item) => item && typeof item.id === 'string' && typeof item.companyId === 'string' && Number.isInteger(item.fy))
      .map((item) => ({
        id: item.id,
        companyId: item.companyId,
        fy: item.fy,
        rows: Array.isArray(item.rows) ? item.rows.map(normalizeRow) : [],
        files: Array.isArray(item.files) ? item.files.filter((file) => file && typeof file.path === 'string') : [],
      }))
    : [];
  if (companies.length === 0 && folders.length === 0) return emptyArchive();
  return { companies, folders };
}

function normalizeRow(row: Partial<ArchiveRow>): ArchiveRow {
  const form = ARCHIVE_FORMS.includes(row.form as ArchiveForm) ? (row.form as ArchiveForm) : '';
  return {
    id: typeof row.id === 'string' ? row.id : crypto.randomUUID(),
    agreement: String(row.agreement ?? ''),
    concept: String(row.concept ?? ''),
    rate: String(row.rate ?? ''),
    base: String(row.base ?? ''),
    payment: String(row.payment ?? ''),
    form,
  };
}

export function emptyRow(agreement = ''): ArchiveRow {
  return { id: crypto.randomUUID(), agreement, concept: '', rate: '', base: '', payment: '', form: '' };
}

export function findFolder(archive: TradeArchive, companyId: string, fy: number): ArchiveFolder | null {
  return archive.folders.find((folder) => folder.companyId === companyId && folder.fy === fy) || null;
}

/** Returns the archive with the folder updated (creating it if it does not exist yet). */
export function updateFolder(
  archive: TradeArchive,
  companyId: string,
  fy: number,
  change: (folder: ArchiveFolder) => ArchiveFolder,
): TradeArchive {
  const existing = findFolder(archive, companyId, fy);
  const base = existing || { id: crypto.randomUUID(), companyId, fy, rows: [], files: [] };
  const next = change(base);
  const folders = existing
    ? archive.folders.map((folder) => (folder.id === existing.id ? next : folder))
    : [...archive.folders, next];
  return { ...archive, folders };
}

export function companyYears(archive: TradeArchive, companyId: string): number[] {
  const years = new Set(DEFAULT_FYS);
  archive.folders.filter((folder) => folder.companyId === companyId).forEach((folder) => years.add(folder.fy));
  return Array.from(years).sort((a, b) => a - b);
}

function safeName(name: string): string {
  const cleaned = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return cleaned.slice(-120) || 'archivo';
}

function requireStorage() {
  if (!supabase) throw new Error('Faltan las claves de Supabase.');
  return supabase.storage.from(TRADE_ARCHIVE_BUCKET);
}

export function isMissingBucketError(message: string): boolean {
  return /bucket not found/i.test(message) || /row-level security/i.test(message);
}

export async function uploadArchiveFile(
  companyId: string,
  fy: number,
  kind: ArchiveFile['kind'],
  file: Blob,
  name: string,
): Promise<ArchiveFile> {
  if (file.size > TRADE_ARCHIVE_MAX_BYTES) {
    throw new Error(`${name} pesa más de 25 MB.`);
  }
  const id = crypto.randomUUID();
  const path = `${companyId}/${fy}/${id}-${safeName(name)}`;
  const { error } = await requireStorage().upload(path, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  });
  if (error) throw new Error(error.message);
  return {
    id,
    kind,
    name,
    mime: file.type || 'application/octet-stream',
    size: file.size,
    path,
    addedAt: new Date().toISOString(),
  };
}

export async function signedUrls(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data, error } = await requireStorage().createSignedUrls(paths, 60 * 60);
  if (error) throw new Error(error.message);
  const out: Record<string, string> = {};
  (data || []).forEach((item) => {
    if (item.path && item.signedUrl) out[item.path] = item.signedUrl;
  });
  return out;
}

export async function removeArchiveFile(path: string): Promise<void> {
  const { error } = await requireStorage().remove([path]);
  if (error) throw new Error(error.message);
}

export function formatBytes(size: number): string {
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}
