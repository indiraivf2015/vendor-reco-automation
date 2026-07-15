export function n(v: any): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}
export function nUpper(v: any): string { return n(v).toUpperCase(); }

/** PAN: trim, remove all whitespace (fixes "ABCDE 1234 F" vs "ABCDE1234F"), uppercase. */
export function nPan(v: any): string {
  return n(v).replace(/\s+/g, '').toUpperCase();
}
export function nName(v: any): string { return n(v).replace(/\s+/g, ' ').toUpperCase(); }
/** Payment terms: lowercase, trim, collapse internal whitespace ("Net  30" → "net 30"). */
export const nPayTerm = (v: any): string =>
  String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * TDS section normalization (Sprint 5.x).
 *
 * Strips trailing _<digits> or _<digits>.<digits> rate suffix, then uppercases
 * and collapses whitespace. This lets ERP's "393(1)_CONTRACT_2" match P2P's
 * "393(1)_CONTRACT" — the rate suffix is a 2024 GoI code-format change that
 * ERP applied but P2P did not. The 393(2)_FOREIGN REMITTANCE codes carry the
 * suffix on both sides, so symmetric stripping keeps them matching too.
 *
 * Storage is untouched; this is comparison-only.
 *
 * Examples:
 *   "393(1)_CONTRACT_2"              → "393(1)_CONTRACT"
 *   "393(1)_PURCHASE OF GOODS_0.1"   → "393(1)_PURCHASE OF GOODS"
 *   "393(2)_FOREIGN REMITTANCE_10"   → "393(2)_FOREIGN REMITTANCE"
 *   "393(1)_CONTRACT"                → "393(1)_CONTRACT"
 */
export const nTds = (v: any): string =>
  String(v ?? '')
    .trim()
    .replace(/_\d+(\.\d+)?$/, '')
    .toUpperCase()
    .replace(/\s+/g, ' ');
export function nAccount(v: any): string {
  return n(v).replace(/\s+/g, '').replace(/^0+/, '');
}
export function isEmpty(v: any): boolean {
  if (v === null || v === undefined) return true;
  const s = String(v).trim();
  return s === '' || s === '0' || s.toLowerCase() === 'null' || s.toLowerCase() === 'na';
}
export function fieldEquals(a: any, b: any, normalize: (x: any) => string = n): boolean {
  const ea = isEmpty(a), eb = isEmpty(b);
  if (ea && eb) return true;
  if (ea !== eb) return false;
  return normalize(a) === normalize(b);
}
