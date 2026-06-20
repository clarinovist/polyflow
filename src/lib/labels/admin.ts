/** Admin – Audit Logs labels */
export const auditLogLabels = {
  totalRecords: 'Total Rekaman',
  eventTrailsCaptured: 'Jejak event yang ditangkap',
  actionsProfiled: 'Aksi yang Diprofilkan',
  uniqueSystemOperations: 'Operasi sistem unik',
  entitiesMonitored: 'Entitas yang Dipantau',
  databaseModelsTracked: 'Model database yang dilacak',
  filters: 'Filter:',
  allActions: 'Semua Aksi',
  allEntities: 'Semua Entitas',
  clearFilters: 'Hapus Filter',
} as const;

/** Admin – System Health labels */
export const systemHealthLabels = {
  title: 'Kesehatan Sistem',
  allSystemsOperational: 'Semua Sistem Beroperasi',
  systemsDegraded: 'Sistem Menurun',
  lastUpdated: 'Terakhir diperbarui:',
  diagnosticsUnavailable: 'Diagnostics tidak tersedia saat ini.',
  database: 'Database',
  latency: 'Latensi',
  nodejsUptime: 'Waktu Aktif Node.js',
  processUptime: 'Waktu aktif proses',
  osMemoryUsage: 'Penggunaan Memori OS',
  v8Heap: 'V8 Heap',
  environmentVariables: 'Variabel Lingkungan',
  envDescription: 'Status kunci konfigurasi sistem yang diperlukan',
  configured: 'Dikonfigurasi',
  missing: 'Tidak Ditemukan',
  hostInformation: 'Informasi Host',
  hostDescription: 'Spesifikasi OS dan hardware',
  platform: 'Platform',
  logicalCpus: 'CPU Logis',
  systemUptime: 'Waktu Aktif Sistem',
  nodeRss: 'Node RSS',
} as const;
