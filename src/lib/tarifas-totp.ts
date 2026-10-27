import { createHmac, timingSafeEqual } from 'crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/g, '').replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const char of clean) {
    const value = ALPHABET.indexOf(char);
    if (value < 0) continue;
    bits += value.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter % 0x100000000, 4);
  const hmac = createHmac('sha1', secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = ((hmac[offset] & 0x7f) << 24 | hmac[offset + 1] << 16 | hmac[offset + 2] << 8 | hmac[offset + 3]) % 1_000_000;
  return String(code).padStart(6, '0');
}

export function totpSecret(): string {
  return (process.env.TARIFAS_ADMIN_TOTP_SECRET || '').replace(/\s/g, '').toUpperCase();
}

export function adminPin(): string {
  return process.env.TARIFAS_ADMIN_PIN || '2627';
}

export function totpConfigured(): boolean {
  return totpSecret().length >= 16;
}

export function verifyTotp(code: string): boolean {
  const secret = totpSecret();
  if (!secret) return false;
  const clean = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(clean)) return false;
  const key = base32Decode(secret);
  const now = Math.floor(Date.now() / 1000 / 30);
  for (const step of [now - 1, now, now + 1]) {
    const expected = Buffer.from(hotp(key, step));
    const got = Buffer.from(clean);
    if (expected.length === got.length && timingSafeEqual(expected, got)) return true;
  }
  return false;
}

export function otpauthUrl(): string | null {
  const secret = totpSecret();
  if (!secret) return null;
  return `otpauth://totp/TS%20Operaciones:Tarifas?secret=${secret}&issuer=TS%20Operaciones&algorithm=SHA1&digits=6&period=30`;
}
