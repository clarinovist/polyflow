/**
 * PolyFlow Error Message Catalog
 *
 * Centralized error messages for consistent UX across the application.
 *
 * Usage:
 *   import { ErrorCatalog } from '@/lib/errors/error-catalog'
 *   // Use ErrorCatalog.DUPLICATE_ENTRY, ErrorCatalog.NOT_FOUND, etc.
 *
 * Prisma error mapping is handled by mapPrismaError() in prisma-error-map.ts.
 * Domain-specific messages are thrown as ApplicationError subclasses.
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

  // Database / Prisma mapped
  DB_TIMEOUT: 'Koneksi ke database timeout. Silakan coba lagi beberapa saat.',
  VALUE_TOO_LONG: 'Teks terlalu panjang untuk salah satu field. Perpendek input lalu coba lagi.',
  NULL_CONSTRAINT: 'Field wajib tidak boleh kosong. Periksa formulir lalu coba lagi.',
  FOREIGN_KEY: 'Operasi ditolak karena relasi data. Data terkait tidak ditemukan, atau masih dipakai entitas lain.',
} as const;
