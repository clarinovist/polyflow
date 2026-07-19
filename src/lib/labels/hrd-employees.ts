export const payTypeLabels: Record<string, string> = {
  DAILY: 'Harian',
  PIECE: 'Borongan',
  MONTHLY: 'Bulanan',
};

export const employmentStatusLabels: Record<string, string> = {
  PROBATION: 'Probation',
  PERMANENT: 'Tetap',
  CONTRACT: 'Kontrak',
  RESIGNED: 'Resign',
  TERMINATED: 'PHK',
};

export const employeeStatusLabels: Record<string, string> = {
  ACTIVE: 'Aktif',
  INACTIVE: 'Nonaktif',
};

export const employeeDocumentCategoryLabels: Record<string, string> = {
  KTP: 'KTP',
  NPWP: 'NPWP',
  KK: 'Kartu Keluarga',
  CONTRACT: 'Perjanjian kerja',
  APPOINTMENT: 'SK pengangkatan',
  CERTIFICATE: 'Ijazah / sertifikat',
  BANK_BOOK: 'Buku rekening',
  PHOTO_ID: 'Pas foto',
  OTHER: 'Lainnya',
};

export const EMPLOYEE_DOCUMENT_CATEGORIES = [
  'KTP',
  'NPWP',
  'KK',
  'CONTRACT',
  'APPOINTMENT',
  'CERTIFICATE',
  'BANK_BOOK',
  'PHOTO_ID',
  'OTHER',
] as const;
