export const OWNER_EMAIL = 'cristobal.alonso@sportsemotion.com';
export const PRODUCTION_APP_URL = 'https://ts-operaciones-herramientas.vercel.app';

export function isOwnerEmail(email?: string | null) {
  return String(email || '').trim().toLocaleLowerCase('es') === OWNER_EMAIL;
}
