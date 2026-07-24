/**
 * Help Center learning sanitizer — strip tenant-sensitive entities before draft/cluster.
 * Non-negotiable: never publish raw customer names, SO numbers, qty specifics, invoices into global KB.
 */

// Patterns that look like tenant-operational data — replace with generic placeholders
const SENSITIVE_PATTERNS: Array<{ regex: RegExp; replace: string }> = [
  // SO / PO / Invoice / SJ numbers: SO-2026-0001, INV-xxx, PO-..., SJ-...
  { regex: /\b((SO|PO|SJ|SJ-?|INV|GR|SPK|RET)-?[\w-]+\d[\w-]*)\b/gi, replace: '[NOMOR-DOKUMEN]' },
  // CUID-ish ids in questions
  { regex: /\b(c[a-z0-9]{24,})\b/gi, replace: '[ID]' },
  // UUID
  { regex: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, replace: '[ID]' },
  // Email
  { regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, replace: '[EMAIL]' },
  // Phone-ish (08xx long)
  { regex: /\b0\d{9,14}\b/g, replace: '[NO-HP]' },
  // Qty with unit e.g. "100 KG" often tenant-specific
  { regex: /\b\d+(\.\d+)?\s*(KG|PCS|Pcs|Roll|Meter|MTR)\b/g, replace: '[QTY]' },
  // IDR amounts
  { regex: /\bRp\.?\s?[\d.,]+\b/gi, replace: '[NOMINAL]' },
];

const CUSTOMER_NAME_HINT = /\b(customer|pelanggan|client)\s+[A-Z]\w+/gi;

export function sanitizeQuestion(input: string): string {
  let out = input.trim().slice(0, 500);
  for (const { regex, replace } of SENSITIVE_PATTERNS) {
    out = out.replace(regex, replace);
  }
  out = out.replace(CUSTOMER_NAME_HINT, 'customer [NAMA]');
  return out.replace(/\s+/g, ' ').trim();
}

export function sanitizeSampleQuestions(samples: string[]): string[] {
  return samples.slice(0, 5).map(sanitizeQuestion);
}

/** Check if a question contains sensitive patterns that should block draft creation */
export function containsSensitiveData(input: string): boolean {
  const lower = input.toLowerCase();
  // Block if question contains actual email/phone/ID patterns (not already sanitized)
  const rawPatterns = [
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
    /\b0\d{9,14}\b/,
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i,
  ];
  for (const p of rawPatterns) {
    if (p.test(input)) return true;
  }
  void lower; // keep linter quiet — future use for blocklist
  return false;
}
