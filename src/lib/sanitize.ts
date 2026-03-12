/**
 * Simple HTML sanitizer to strip dangerous tags.
 * For advanced usage, a DOMPurify wrapper may be preferred, 
 * but this is a lightweight regex-based approach for Next.js Server Actions 
 * where we only expect plain text with minimal formatting.
 */

export function sanitizeHtml(input: string | null | undefined): string {
  if (!input) return '';
  
  // Strip <script>, <iframe>, <object>, etc.
  let sanitized = input.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  sanitized = sanitized.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
  sanitized = sanitized.replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '');
  
  // Remove event handlers like onload, onerror, javascript: protocols
  sanitized = sanitized.replace(/ on\w+="[^"]*"/gi, '');
  sanitized = sanitized.replace(/ on\w+='[^']*'/gi, '');
  sanitized = sanitized.replace(/ javascript:[^"']*/gi, '');

  return sanitized;
}

export function sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
  if (!obj) return obj;
  
  const sanitizedObj = { ...obj } as Record<string, unknown>;
  
  for (const [key, value] of Object.entries(sanitizedObj)) {
    if (typeof value === 'string') {
      sanitizedObj[key] = sanitizeHtml(value);
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      sanitizedObj[key] = sanitizeObject(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      sanitizedObj[key] = value.map(item => 
        typeof item === 'string' 
          ? sanitizeHtml(item) 
          : (typeof item === 'object' && item !== null ? sanitizeObject(item as Record<string, unknown>) : item)
      );
    }
  }
  
  return sanitizedObj as T;
}
