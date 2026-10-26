/** Kiosk Operator */
export const kioskLabels = {
    // Shell
    shellPlace: 'Kiosk · Lantai produksi',
    fullscreenEnter: 'Layar penuh',
    fullscreenExit: 'Keluar layar penuh',
    loadingKiosk: 'Memuat kiosk…',
    idleTitle: 'Sesi hampir habis',
    idleDesc: 'Tidak ada sentuhan. Sesi operator berakhir dalam',
    idleSeconds: 'detik',
    idleContinue: 'Ketuk untuk lanjut',

    // Hub
    hubGreeting: 'Halo,',
    tileProduksi: 'SPK saya',
    tileProduksiDesc: 'Daftar SPK, mulai & catat hasil',
    tileProduksiActive: 'berjalan',
    tileAbsensi: 'Absensi',
    tileAbsensiDesc: 'Masuk / pulang shift',
    tileProsesKhusus: 'Proses khusus',
    tileProsesKhususDesc: 'Laporan mesin HD dan Potong/Plong',
    tileStatusSaya: 'Status saya',
    tileStatusSayaDesc: 'Hasil & gaji. Buka /my di HP Anda.',
    todayTitle: 'Hari ini,',
    todayGood: 'Hasil bagus',
    todayScrap: 'Affal',
    todayJobs: 'SPK dikerjakan',
    todayActive: 'SPK berjalan',
    todayEmpty: 'Belum ada hasil hari ini.',
    todayLoading: 'Memuat ringkasan hari ini…',

    // Job list
    jobList: 'SPK saya',
    jobsUpdated: 'Diperbarui',
    jobsAutoRefresh: 'otomatis tiap 30 detik',
    jobsMenu: 'Menu',
    jobsSearch: 'Cari atau scan nomor SPK',
    jobsFilterLabel: 'Saring mesin',
    jobsAllMachines: 'Semua mesin',
    jobsManual: 'Tanpa mesin',
    jobsOpen: 'Buka',
    jobsView: 'Lihat & mulai',
    jobsPackaging: 'Etiket & kemasan dicatat',
    jobsLabelStock: 'stok',
    jobsLabelEmpty: 'stok habis',
    jobsNoOperator: 'Belum ada operator yang dipilih.',
    jobsNoAssignmentTitle: 'Belum ada penugasan mesin',
    jobsNoAssignmentDesc:
        'Anda belum ditugaskan ke mesin tertentu, jadi semua SPK ditampilkan. Hubungi kepala regu.',
    modeIndividual: 'Hasil individu',
    modeMaterial: 'Konversi material',
    startJob: 'Mulai SPK',
    logOutput: 'Catat Hasil',
    machine: 'Mesin',
    shift: 'Shift',
    running: 'Berjalan',
    refresh: 'Segarkan',

    // Akhiri pekerjaan (stop dialog)
    stopTitle: 'Akhiri pekerjaan di',
    stopUnrecorded:
        'Hasil terakhir belum dicatat? Catat dulu supaya etiket dan kemasannya ikut tercatat.',
    stopRecord: 'Catat hasil',
    stopPause: 'Jeda',
    stopPauseDesc:
        'SPK tetap berjalan. Anda atau operator lain bisa melanjutkan nanti.',
    stopFinish: 'SPK selesai',
    stopFinishDesc: 'Tutup SPK di',
    stopFinishRest: 'tidak dikerjakan.',
    stopFailed: 'Gagal mengakhiri pekerjaan. Coba lagi.',
    stopPaused: 'Pekerjaan dijeda.',
    stopFinished: 'SPK selesai.',
    dialogClose: 'Tutup',

    // Riwayat catat
    historyTitle: 'Riwayat catat SPK ini',
    historyCount: 'catatan',
    historyEmpty: 'Belum ada hasil yang dicatat untuk SPK ini.',
    historyTime: 'Jam',
    historyOperator: 'Operator',
    historyOutput: 'Hasil',
    historyPackaging: 'Kemasan',
    historyScrap: 'Affal',

    // Focus mode
    focusBack: 'SPK saya',
    focusDowntime: 'Lapor mesin bermasalah',
    focusMaterial: 'Bahan tambahan',
    focusRemaining: 'sisa',
    focusSince: 'sejak',
    focusMyShift: 'Hasil saya shift ini',
    focusShiftTotal: 'Total shift ini',
    focusStaleShift:
        'Belum ada shift aktif untuk jadwal ini, jadi angka shift memakai shift terakhir. Minta admin menambahkan shift hari ini.',
    downtimeReason: 'Apa masalahnya?',
    downtimeReasonHint: 'contoh: motor panas, belt putus',
    downtimeSaved: 'Laporan tersimpan. Mesin ditandai sedang diperbaiki.',
    downtimeFailed: 'Gagal mengirim laporan. Coba lagi.',
    focusStop: 'Jeda / selesai',

    // Execution mode (capability-driven kiosk behavior)
    bomStandardLabel: 'Standar BOM',
    bomWipPreviewLabel: 'Perkiraan WIP Terpakai',
    bomInvalidMessage:
        'BOM tidak valid — periksa standar BOM SPK sebelum menyimpan',
    shiftWajibMessage: 'Shift wajib dipilih sebelum menyimpan hasil',

    // Wizard catat hasil (Tahap 2)
    wizardTitle: 'Catat hasil',
    wizardStepHasil: 'Hasil',
    wizardStepAffal: 'Affal',
    wizardStepQc: 'QC',
    wizardStepKirim: 'Kirim',
    wizardHasilTitle: 'Berapa hasil bagusnya?',
    wizardHasilIndividualTitle: 'Berapa hasil Anda?',
    wizardHasilDesc: 'Timbang total neto batch ini.',
    wizardQtyZero: 'Hasil 0, hanya affal',
    wizardKeypad: 'Keypad angka',
    wizardQtyMissing: 'Isi hasil, atau pilih "Hasil 0, hanya affal".',
    wizardQtyInvalid: 'Jumlah hasil tidak valid.',
    wizardBaseUnitNote: 'Dicatat di sistem dalam',
    wizardKemasanTitle: 'Kemasan & etiket yang terpakai',
    wizardKemasanCountDesc:
        'Isi jumlah sebenarnya. Sistem tidak menghitung otomatis.',
    wizardAffalTitle: 'Ada affal?',
    wizardAffalDesc: 'Dalam KG. Pilih "Tidak ada affal" bila memang tidak ada.',
    wizardProngkolDesc: 'Gumpalan / sisa leleh',
    wizardDaunDesc: 'Potongan pinggir / reject lembaran',
    wizardNoScrap: 'Tidak ada affal',
    wizardScrapMissing: 'Isi affal, atau pilih "Tidak ada affal".',
    wizardScrapRequired: 'Hasil bagus 0, jadi affal wajib diisi.',
    wizardScrapInvalid: 'Jumlah affal tidak valid.',
    wizardQcTitle: 'Hasil ukur QC',
    wizardQcMissing: 'Isi semua hasil ukur QC sebelum lanjut.',
    wizardKirimTitle: 'Periksa lalu kirim',
    wizardKirimDesc:
        'Setelah dikirim, stok bahan dan kemasan langsung berkurang.',
    wizardTeam: 'Tim',
    wizardHelpers: 'helper',
    wizardPhotoAdd: 'Tambah foto (opsional)',
    wizardNotesAdd: 'Catatan (opsional)',
    wizardNotesHint: 'contoh: nomor batch, ID roll',
    wizardUploading: 'Mengunggah foto…',
    wizardSentAs: 'Dikirim sebagai',
    wizardSentAsHint:
        'dari PIN saat masuk sesi. Bukan Anda? Ganti operator di menu.',
    wizardShiftStale:
        'Semua shift untuk SPK ini sudah lewat. Pilih shift yang benar, atau minta PPIC menambah shift baru.',
    wizardNoShift:
        'Belum ada shift di SPK ini. Minta PPIC menambahkan shift dulu.',
    wizardSummaryTitle: 'Ringkasan catatan',
    wizardSavedTitle: 'Hasil tersimpan',
    wizardSavedTotal: 'Total dicatat di sesi ini',
    wizardBackToSpk: 'Kembali ke SPK',
    wizardFailed: 'Gagal mencatat hasil. Coba lagi.',

    // Wizard catat hasil
    wizardStepKemasan: 'Kemasan & etiket',
    packagingNotLoaded: 'Data kemasan belum termuat. Ketuk Coba lagi.',
    packagedRequestReused:
        'Catatan sebelumnya ternyata sudah tersimpan. Periksa riwayat catat, lalu kirim lagi hanya bila ini batch baru.',
    wizardQCDesc: 'Isi hasil ukur sesuai standar kualitas',
    wizardQCOutOfRange: 'Di luar standar — tetap bisa dikirim',
    wizardNext: 'Lanjut',
    wizardBack: 'Kembali',
    wizardSubmit: 'Kirim hasil',
    wizardCatatLagi: 'Catat lagi',
    wizardQtyLabel: 'Jumlah hasil bagus',
    wizardScrapProngkol: 'Prongkol',
    wizardScrapDaun: 'Daun',
    wizardSuccessDesc: 'Hasil produksi berhasil dicatat.',

    // Operator gate
    operatorGateTitle: 'Siapa yang bertugas?',
    operatorGateDesc: 'Ketuk nama Anda, lalu masukkan PIN absensi.',
    operatorGateHint:
        'Sesi berakhir saat ganti operator atau 15 menit tanpa aktivitas.',
    gateAttendance: 'Absensi masuk / pulang',
    gateSearch: 'Cari nama operator',
    gateFilterLabel: 'Saring operator',
    gateFilterAll: 'Semua',
    gateFilterRunning: 'Sedang jalan',
    gateRunning: 'Jalan SPK',
    gateNoMatch: 'Tidak ada operator yang cocok.',
    gateNoMachine: 'Tanpa mesin tetap',
    operatorGateEmpty:
        'Belum ada operator terdaftar. Minta kepala regu menambahkan Anda sebagai operator di Data Karyawan.',
    pinTitle: 'Masukkan PIN absensi',
    pinNoPinHint: 'Belum punya PIN? Minta HRD membuatkan PIN absensi.',
    pinSubmit: 'Masuk',
    pinNotMe: 'Bukan saya',
    pinCheckFailed: 'Gagal memeriksa PIN. Periksa koneksi lalu coba lagi.',
    sessionExpired:
        'Sesi operator berakhir. Pilih nama Anda dan masukkan PIN lagi.',

    // Session
    sessionLogout: 'Ganti operator',
    sessionLogoutTitle: 'Ganti operator?',
    sessionLogoutConfirm: 'Ganti operator',
    sessionLogoutCancel: 'Batal',
    sessionLogoutHint:
        'Pastikan hasil sudah tercatat sebelum tablet dipakai operator berikutnya.',

    // Empty states
    emptyNoJobsForMachine: 'Tidak ada SPK untuk mesin Anda',
    emptyNoJobsReady: 'Belum ada SPK Siap Produksi',
    emptyWaitingRelease: 'Menunggu rilis SPK dari kantor perencanaan.',
    emptyNoFilterMatch: 'Tidak ada SPK cocok dengan filter',
    emptyClearFilter: 'Hapus Filter',

    // Device
} as const;
