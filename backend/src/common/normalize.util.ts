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
