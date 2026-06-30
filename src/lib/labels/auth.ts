/** Auth / login page labels */
export const loginFormLabels = {
  backToRoleSelection: 'Kembali ke pilihan peran',
  workspaceBadge: 'Workspace',
  signIn: 'Masuk',
  signInHeader: 'Masuk',
  emailAddress: 'Alamat Email',
  password: 'Kata Sandi',
  emailPlaceholder: 'Johndoe@gmail.com',
  passwordPlaceholder: '••••••••',
  hidePassword: 'Sembunyikan kata sandi',
  showPassword: 'Tampilkan kata sandi',
  rememberMe: 'Ingat saya',
  signingIn: 'Sedang masuk...',
} as const;

/** Workspace discovery labels */
export const workspaceDiscoveryLabels = {
  signInToWorkspace: 'Masuk ke workspace Anda',
  description: 'Masukkan URL workspace Anda untuk melanjutkan ke dashboard ERP.',
  protocolPrefix: 'https://',
  domainSuffix: '.polyflow.uk',
  placeholder: 'your-company',
  connecting: 'Menghubungkan...',
  continueToWorkspace: 'Lanjut ke Workspace',
  notSure: 'Tidak yakin dengan URL workspace Anda?',
  checkEmail: 'Periksa email selamat datang dari administrator.',
  noWorkspace: 'Belum memiliki workspace?',
  registerNewCompany: 'Daftar Perusahaan Baru',
} as const;

/** Error boundary labels */
export const errorBoundaryLabels = {
  title: 'Gagal memproses',
  description: 'Silakan coba lagi atau hubungi admin.',
  reloadPage: 'Muat Ulang Halaman',
} as const;

/** Brand panel labels */
export const brandPanelLabels = {
  welcomeTo: 'Selamat datang di',
  signInDescription:
    'Masuk untuk mengakses dashboard ERP, kelola alur kerja produksi, dan lacak inventaris Anda secara mulus.',
  brandDescription:
    'PolyFlow membantu bisnis membangun operasi yang terorganisir dan terstruktur dengan modul yang indah dan kaya fitur. Bergabunglah dan mulailah membangun bisnis Anda hari ini.',
  enterprisePortal: 'Portal enterprise didukung oleh PolyFlow',
  joinUs: 'Lebih dari 1K orang telah bergabung, giliran Anda',
  streamlineTitle: 'Optimalkan operasi bisnis Anda hari ini',
  streamlineDescription:
    'Jadilah salah satu pengusaha pertama yang merasakan cara termudah mengelola bisnis.',
} as const;
