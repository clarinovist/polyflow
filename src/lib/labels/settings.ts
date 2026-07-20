/** Settings labels */
export const settingsLabels = {
  // Tabs
  general: 'Umum',
  generalDesc: 'Kelola profil dan preferensi Anda',
  notifications: 'Notifikasi',
  notificationsDesc: 'Kelola preferensi notifikasi in-app',
  company: 'Perusahaan',
  companyDesc: 'Info perusahaan untuk dokumen cetak',
  users: 'Pengguna',
  usersDesc: 'Kelola pengguna sistem dan role',
  accessControl: 'Kontrol Akses',
  accessControlDesc: 'Konfigurasi izin untuk setiap role',
  system: 'Sistem',
  systemDesc: 'Lihat kesehatan sistem dan versi',

  // System Info
  systemInfo: 'Info Sistem',
  erpVersion: 'Versi ERP',
  environment: 'Lingkungan',
  development: 'Development',
  serverStatus: 'Status Server',
  online: 'Online',

  // Access Control
  module: 'Modul',
  feature: 'Fitur',
  featurePermissions: 'Izin Fitur',
  featurePermissionsDesc: 'Kontrol akses ke fitur tertentu dan visibilitas data.',
  viewPrices: 'Lihat Harga',
  viewPricesDesc: 'Dapat melihat harga produk dan nilai inventaris',
  menu: 'Menu',
  permissionSaved: 'Izin disimpan',
  permissionSaveFailed: 'Gagal memperbarui izin',
  permissionAutoSaveHint:
    'Perubahan tersimpan otomatis saat Anda mencentang. Tidak perlu tombol Simpan.',
  permissionReloginHint:
    'Pengguna yang sudah login mungkin perlu login ulang agar menu/akses modul baru aktif penuh di sesi mereka.',
  permissionTreeHint:
    'Centang modul root = beri akses penuh ke semua sub-fitur di bawahnya. Centang sub-fitur saja = akses terbatas ke halaman tersebut. Checkbox parent menampilkan tanda indeterminate (–) ketika hanya sebagian anak yang dicentang.',
} as const;
