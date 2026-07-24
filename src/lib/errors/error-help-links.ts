/**
 * Maps error codes to help article slugs for contextual help CTAs.
 * Used by toast notifications to add "Lihat panduan" links.
 */

const ERROR_HELP_MAP: Record<string, { slug: string; title: string }> = {
  INSUFFICIENT_STOCK: {
    slug: 'cara-confirm-so-stok-kurang',
    title: 'Stok kurang? Lihat panduan',
  },
  STOCK_INSUFFICIENT: {
    slug: 'cara-outgoing-muat-kirim',
    title: 'Stok kurang saat muat? Lihat panduan',
  },
  CREDIT_LIMIT_EXCEEDED: {
    slug: 'cara-confirm-so-stok-kurang',
    title: 'Limit kredit? Lihat panduan',
  },
  MATERIAL_INSUFFICIENT: {
    slug: 'error-backflush-atau-stok-bahan',
    title: 'Stok bahan kurang? Lihat panduan',
  },
  BACKFLUSH_FAILED: {
    slug: 'error-backflush-atau-stok-bahan',
    title: 'Backflush gagal? Lihat panduan',
  },
  PERIOD_LOCKED: {
    slug: 'error-period-locked-finance',
    title: 'Period locked? Lihat panduan',
  },
  POSTING_PERIOD_CLOSED: {
    slug: 'error-period-locked-finance',
    title: 'Period locked? Lihat panduan',
  },
  PERMISSION_DENIED: {
    slug: 'menu-tidak-muncul-permission',
    title: 'Akses ditolak? Lihat panduan',
  },
  ACCESS_DENIED: {
    slug: 'menu-tidak-muncul-permission',
    title: 'Akses ditolak? Lihat panduan',
  },
};

export function getHelpLinkForError(code: string): { href: string; title: string } | null {
  const entry = ERROR_HELP_MAP[code];
  if (!entry) return null;
  return {
    href: `/support/${entry.slug}`,
    title: entry.title,
  };
}

/**
 * Checks if an error message contains patterns that suggest a known error type.
 * Useful when error code is not available but message contains keywords.
 */
export function getHelpLinkForMessage(message: string): { href: string; title: string } | null {
  const lower = message.toLowerCase();

  if (lower.includes('stok') && (lower.includes('tidak cukup') || lower.includes('kurang') || lower.includes('insufficient'))) {
    return { href: '/support/cara-confirm-so-stok-kurang', title: 'Stok kurang? Lihat panduan' };
  }

  if (lower.includes('backflush') || (lower.includes('bahan') && lower.includes('kurang'))) {
    return { href: '/support/error-backflush-atau-stok-bahan', title: 'Backflush gagal? Lihat panduan' };
  }

  if (lower.includes('period') && lower.includes('lock')) {
    return { href: '/support/error-period-locked-finance', title: 'Period locked? Lihat panduan' };
  }

  if (lower.includes('permission') || lower.includes('akses ditolak') || lower.includes('access denied')) {
    return { href: '/support/menu-tidak-muncul-permission', title: 'Akses ditolak? Lihat panduan' };
  }

  if (lower.includes('kredit') || lower.includes('credit') || lower.includes('limit')) {
    return { href: '/support/cara-confirm-so-stok-kurang', title: 'Limit kredit? Lihat panduan' };
  }

  return null;
}
