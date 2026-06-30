/**
 * Indonesian Price Format Utilities
 *
 * Handles parsing and formatting of Indonesian currency values.
 * Indonesian format: 1.000.000,32 (dot = thousands, comma = decimal)
 * International format: 1,000,000.32 (comma = thousands, dot = decimal)
 */

/**
 * Parse harga dari format Indonesia/International ke number
 *
 * Supported formats:
 * - "1.000.000,32" → 1000000.32 (Indonesian)
 * - "1,000,000.32" → 1000000.32 (International)
 * - "1.000.000" → 1000000
 * - "1,000,000" → 1000000
 * - "Rp 1.000.000" → 1000000
 * - "Rp1.000.000" → 1000000
 * - "1000000" → 1000000
 * - "1000000,32" → 1000000.32
 * - "1000000.32" → 1000000.32
 */
export function parseIndonesianPrice(value: string): number {
  if (!value) return 0;

  // Remove "Rp" prefix and whitespace
  let cleaned = value.replace(/Rp\.?\s*/i, '').trim();

  // Remove any spaces
  cleaned = cleaned.replace(/\s/g, '');

  if (!cleaned) return 0;

  // Count separators
  const dotCount = (cleaned.match(/\./g) || []).length;
  const commaCount = (cleaned.match(/,/g) || []).length;

  // Determine format by checking separator patterns
  if (dotCount > 1 && commaCount <= 1) {
    // Multiple dots, optional single comma → Indonesian format
    // "1.000.000" or "1.000.000,32"
    // Remove dots (thousands), replace comma with dot (decimal)
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (commaCount > 1 && dotCount <= 1) {
    // Multiple commas, optional single dot → International format
    // "1,000,000" or "1,000,000.32"
    // Remove commas (thousands), keep dot (decimal)
    cleaned = cleaned.replace(/,/g, '');
  } else if (dotCount === 1 && commaCount === 1) {
    // Both present, determine by position
    const lastComma = cleaned.lastIndexOf(',');
    const lastDot = cleaned.lastIndexOf('.');

    if (lastComma > lastDot) {
      // "1.000,32" → Indonesian (comma = decimal)
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      // "1,000.32" → International (dot = decimal)
      cleaned = cleaned.replace(/,/g, '');
    }
  } else if (dotCount === 1 && commaCount === 0) {
    // Single dot, no comma
    const parts = cleaned.split('.');
    if (parts[1] && parts[1].length <= 2) {
      // Likely decimal: "1000.50"
      // Keep as is
    } else {
      // Likely thousands: "1.000"
      cleaned = cleaned.replace(/\./g, '');
    }
  } else if (commaCount === 1 && dotCount === 0) {
    // Single comma, no dot
    const parts = cleaned.split(',');
    if (parts[1] && parts[1].length <= 2) {
      // Likely decimal: "1000,50"
      cleaned = cleaned.replace(',', '.');
    } else {
      // Likely thousands: "1,000"
      cleaned = cleaned.replace(/,/g, '');
    }
  }
  // No separators → use as is

  const result = Number(cleaned);
  return isNaN(result) ? 0 : result;
}

/**
 * Format number ke format Indonesia
 *
 * Examples:
 * - 1000000 → "1.000.000"
 * - 1000000.32 → "1.000.000,32"
 * - 1000000.5 → "1.000.000,5"
 * - 0 → "0"
 */
export function formatIndonesianPrice(value: number): string {
  return value.toLocaleString('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}
