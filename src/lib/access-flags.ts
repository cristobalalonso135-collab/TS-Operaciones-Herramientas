export function accessRequired(): boolean {
  const raw = (process.env.ACCESS_REQUIRED || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}
