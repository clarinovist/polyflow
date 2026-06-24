/**
 * Convert a number to Indonesian words (terbilang).
 * Used for printing "Terbilang: ..." on invoices.
 *
 * Handles up to trillions (triliun).
 * Example: 18750000 → "Delapan Belas Juta Tujuh Ratus Lima Puluh Ribu Rupiah"
 */
const ONES = [
  '', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima',
  'Enam', 'Tujuh', 'Delapan', 'Sembilan',
];

const TEENS = [
  'Sepuluh', 'Sebelas', 'Dua Belas', 'Tiga Belas', 'Empat Belas',
  'Lima Belas', 'Enam Belas', 'Tujuh Belas', 'Delapan Belas', 'Sembilan Belas',
];

function threeDigitChunk(n: number): string {
  if (n === 0) return '';

  const h = Math.floor(n / 100);
  const rem = n % 100;
  const parts: string[] = [];

  if (h === 1) {
    parts.push('Seratus');
  } else if (h > 1) {
    parts.push(`${ONES[h]} Ratus`);
  }

  if (rem === 0) {
    // nothing more
  } else if (rem < 10) {
    parts.push(ONES[rem]);
  } else if (rem < 20) {
    parts.push(TEENS[rem - 10]);
  } else {
    const tens = Math.floor(rem / 10);
    const ones = rem % 10;
    parts.push(`${ONES[tens]} Puluh`);
    if (ones > 0) {
      parts.push(ONES[ones]);
    }
  }

  return parts.join(' ');
}

export function terbilang(amount: number): string {
  if (amount === 0) return 'Nol Rupiah';

  const isNegative = amount < 0;
  const abs = Math.abs(Math.round(amount));

  if (abs === 0) return 'Nol Rupiah';

  const chunks: number[] = [];
  let remaining = abs;

  // Split into groups of 3 digits from right
  while (remaining > 0) {
    chunks.push(remaining % 1000);
    remaining = Math.floor(remaining / 1000);
  }

  // Place names: Ribu, Juta, Miliar, Triliun
  const PLACE_NAMES = ['', 'Ribu', 'Juta', 'Miliar', 'Triliun'];

  const parts: string[] = [];

  for (let i = chunks.length - 1; i >= 0; i--) {
    const chunk = chunks[i];
    if (chunk === 0) continue;

    const chunkWords = threeDigitChunk(chunk);

    // Special case: 1 Ribu → "Seribu", not "Satu Ribu"
    if (i === 1 && chunk === 1) {
      parts.push(`Se${PLACE_NAMES[i]}`);
    } else {
      parts.push(`${chunkWords} ${PLACE_NAMES[i]}`);
    }
  }

  const result = parts.join(' ') + ' Rupiah';
  return isNegative ? `Minus ${result}` : result;
}
