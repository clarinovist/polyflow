/**
 * PolyFlow Error Message Catalog
 * 
 * Centralized error messages for consistent UX across the application.
 * Format: [Action] [Object] gagal: [Reason]. [Solution]
 * 
 * Usage:
 *   import { errorMessage } from '@/lib/errors/error-catalog'
 *   toast.error(errorMessage.saveFailed('produk', 'kode sudah digunakan'))
 */

// ─── Error Categories ──────────────────────────────────────────────

export const ErrorCatalog = {
  // Generic fallbacks
  GENERIC: 'Terjadi kesalahan. Silakan coba lagi.',
  GENERIC_UNEXPECTED: 'Terjadi kesalahan tak terduga. Tim teknis telah diberitahu.',
  NETWORK: 'Koneksi terganggu. Periksa jaringan Anda dan coba lagi.',
  
  // Authentication
  AUTH_EXPIRED: 'Sesi Anda telah berakhir. Silakan login kembali.',
  AUTH_REQUIRED: 'Anda harus login untuk mengakses halaman ini.',
  AUTH_FORBIDDEN: 'Anda tidak memiliki akses ke halaman ini.',
  
  // CRUD Operations
  SAVE_FAILED: 'Gagal menyimpan data.',
  UPDATE_FAILED: 'Gagal memperbarui data.',
  DELETE_FAILED: 'Gagal menghapus data.',
  LOAD_FAILED: 'Gagal memuat data.',
  CREATE_FAILED: 'Gagal membuat data.',
  
  // Specific Operations
  UPLOAD_FAILED: 'Gagal mengunggah file. Periksa ukuran dan format file.',
  IMPORT_FAILED: 'Gagal mengimpor data. Periksa format file.',
  EXPORT_FAILED: 'Gagal mengekspor data.',
  
  // Validation
  VALIDATION_ERROR: 'Terdapat kesalahan pada input data. Silakan periksa formulir.',
  REQUIRED_FIELD: 'Field ini wajib diisi.',
  INVALID_FORMAT: 'Format tidak valid.',
  
  // Business Rules
  DUPLICATE_ENTRY: 'Data dengan kode/nama yang sama sudah ada.',
  NOT_FOUND: 'Data tidak ditemukan atau telah dihapus.',
  ALREADY_COMPLETED: 'Data ini sudah selesai dan tidak dapat diubah.',
  INSUFFICIENT_STOCK: 'Stok tidak mencukupi untuk operasi ini.',
  INVALID_STATE: 'Status data tidak memungkinkan operasi ini.',
  
  // Specific Modules
  PRODUCT_SAVE: 'Gagal menyimpan produk.',
  PRODUCT_DUPLICATE: 'Produk dengan kode atau nama yang sama sudah ada.',
  ORDER_CREATE: 'Gagal membuat pesanan.',
  ORDER_UPDATE: 'Gagal memperbarui pesanan.',
  INVOICE_CREATE: 'Gagal membuat invoice.',
  PAYMENT_RECORD: 'Gagal mencatat pembayaran.',
  
  // File Operations
  FILE_TOO_LARGE: 'Ukuran file melebihi batas maksimum.',
  FILE_INVALID_FORMAT: 'Format file tidak didukung.',
  FILE_PARSE_ERROR: 'Gagal membaca file. Periksa format file.',
  
  // System
  SYSTEM_ERROR: 'Terjadi kesalahan sistem. Silakan coba lagi beberapa saat.',
  MAINTENANCE: 'Sistem sedang dalam pemeliharaan. Silakan coba lagi nanti.',
} as const;

// ─── Dynamic Error Messages ────────────────────────────────────────

/**
 * Create a dynamic error message with context
 * Format: [Action] [Object] gagal: [Reason]
 */
export function createErrorMessage(
  action: string,
  object: string,
  reason?: string,
  solution?: string
): string {
  let message = `Gagal ${action} ${object}`;
  if (reason) {
    message += `: ${reason}`;
  }
  if (solution) {
    message += `. ${solution}`;
  }
  return message;
}

/**
 * Common error message builders
 */
export const errorMessage = {
  // Generic
  generic: (action: string, object: string) => 
    `Gagal ${action} ${object}. Silakan coba lagi.`,
  
  // CRUD
  saveFailed: (object: string, reason?: string) =>
    createErrorMessage('menyimpan', object, reason, 'Silakan coba lagi.'),
  
  updateFailed: (object: string, reason?: string) =>
    createErrorMessage('memperbarui', object, reason, 'Silakan coba lagi.'),
  
  deleteFailed: (object: string, reason?: string) =>
    createErrorMessage('menghapus', object, reason),
  
  loadFailed: (object: string) =>
    `Gagal memuat ${object}. Silakan muat ulang halaman.`,
  
  createFailed: (object: string, reason?: string) =>
    createErrorMessage('membuat', object, reason, 'Silakan coba lagi.'),
  
  // Duplicate
  duplicate: (object: string, field: string = 'kode') =>
    `${object.charAt(0).toUpperCase() + object.slice(1)} dengan ${field} yang sama sudah ada. Gunakan ${field} lain.`,
  
  // Not Found
  notFound: (object: string) =>
    `${object.charAt(0).toUpperCase() + object.slice(1)} tidak ditemukan atau telah dihapus.`,
  
  // Validation
  validation: (field: string, reason: string) =>
    `${field}: ${reason}`,
  
  // State
  invalidState: (object: string, requiredState: string) =>
    `${object} harus dalam status "${requiredState}" untuk melakukan operasi ini.`,
  
  // Stock
  insufficientStock: (item: string, available: number, required: number) =>
    `Stok ${item} tidak mencukupi. Tersedia: ${available}, Diperlukan: ${required}.`,
} as const;

// ─── Prisma Error Translation ──────────────────────────────────────

/**
 * Translate Prisma/technical errors to user-friendly messages
 */
export function translatePrismaError(error: unknown): string {
  if (!(error instanceof Error)) {
    return ErrorCatalog.GENERIC;
  }
  
  const message = error.message.toLowerCase();
  
  // Unique constraint violation
  if (message.includes('unique constraint') || message.includes('p2002')) {
    return ErrorCatalog.DUPLICATE_ENTRY;
  }
  
  // Foreign key violation
  if (message.includes('foreign key') || message.includes('p2003')) {
    return 'Data ini masih digunakan oleh data lain. Hapus data terkait terlebih dahulu.';
  }
  
  // Record not found
  if (message.includes('record to update not found') || message.includes('p2025')) {
    return ErrorCatalog.NOT_FOUND;
  }
  
  // Connection error
  if (message.includes('connection') || message.includes('timeout')) {
    return ErrorCatalog.NETWORK;
  }
  
  // Default
  return ErrorCatalog.GENERIC;
}

/**
 * Translate error to user-friendly message
 * Handles both ApplicationError and generic errors
 */
export function translateError(error: unknown): string {
  // ApplicationError with code
  if (error && typeof error === 'object' && 'code' in error) {
    const appError = error as { code: string; message: string };
    
    // Map known codes to catalog messages
    const codeMap: Record<string, string> = {
      'VALIDATION_ERROR': ErrorCatalog.VALIDATION_ERROR,
      'NOT_FOUND': ErrorCatalog.NOT_FOUND,
      'CONFLICT': ErrorCatalog.DUPLICATE_ENTRY,
      'UNAUTHORIZED': ErrorCatalog.AUTH_EXPIRED,
      'FORBIDDEN': ErrorCatalog.AUTH_FORBIDDEN,
      'INTERNAL_ERROR': ErrorCatalog.GENERIC_UNEXPECTED,
    };
    
    if (codeMap[appError.code]) {
      return codeMap[appError.code];
    }
    
    // Use the error message if it exists and is user-friendly
    if (appError.message && !appError.message.includes('Error:')) {
      return appError.message;
    }
  }
  
  // Error instance
  if (error instanceof Error) {
    return translatePrismaError(error);
  }
  
  // String error
  if (typeof error === 'string') {
    return error;
  }
  
  return ErrorCatalog.GENERIC;
}
