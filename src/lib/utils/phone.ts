/**
 * Phone normalization for employee login.
 * Accepts 08xxxx, 628xxxx, +628xxxx, 8xxxx
 * Returns normalized 08xxxx format for DB lookup.
 * Also returns list of variants to search.
 */

export function normalizePhone(input: string): string {
  let p = input.trim().replace(/[\s\-()]/g, '');
  if (p.startsWith('+62')) p = '0' + p.slice(3);
  else if (p.startsWith('62')) p = '0' + p.slice(2);
  else if (p.startsWith('8')) p = '0' + p;
  // ensure starts with 0
  return p;
}

export function phoneVariants(input: string): string[] {
  const norm = normalizePhone(input);
  if (!norm.match(/^0\d{9,14}$/)) return [norm];

  // Generate all forms: 08x, 628x, +628x
  const withoutZero = norm.slice(1);
  return [
    norm, // 08xxxx
    '62' + withoutZero, // 628xxxx
    '+62' + withoutZero, // +628xxxx
    withoutZero, // 8xxxx (just in case)
  ];
}

export function isValidPhone(input: string): boolean {
  const n = normalizePhone(input);
  return /^0\d{9,14}$/.test(n);
}
