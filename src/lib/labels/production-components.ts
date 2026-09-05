/** Production components labels */
export const productionComponentLabels = {
    // Forms — common
    selectType: 'Pilih tipe',
    selectLocation: 'Pilih lokasi',
    selectStatus: 'Pilih status',
    generating: 'Generating...',
    searchRole: 'Cari role...',
    eGExample: 'contoh',

    // Machine Form
    machineCode: 'Kode Mesin',
    machineName: 'Nama Mesin',
    machineType: 'Tipe Mesin',
    machineLocation: 'Lokasi Mesin',
    machineStatus: 'Status Mesin',
    machineCapacity: 'Kapasitas Mesin',
    selectMachineType: 'Pilih tipe mesin',
    selectMachineLocation: 'Pilih lokasi mesin',
    selectMachineStatus: 'Pilih status mesin',

    // Employee Form
    employeeName: 'Nama Karyawan',
    employeeRole: 'Role Karyawan',
    employeeNik: 'NIK',
    employeePhone: 'Telepon',
    employeeSalary: 'Gaji',
    selectStandardShift: 'Pilih Shift Standar',
    selectMachineUpdatesOrder: 'Pilih Mesin (Update Pesanan)',
    selectOperator: 'Pilih Operator',

    // Shift Manager
    shiftManagement: 'Manajemen Shift',
    shiftSchedule: 'Jadwal Shift',
    assignShift: 'Tugaskan Shift',
    activeShift: 'Shift Aktif',

    // BOM
    bomName: 'Nama BOM',
    bomDescription: 'Deskripsi BOM',
    outputProduct: 'Produk Hasil',
    outputQuantity: 'Jumlah Hasil',
    bomStage: 'Stage BOM',
    selectProductToProduce: 'Pilih produk yang akan diproduksi',
    selectStage: 'Pilih Stage',
    materialList: 'Daftar Material',
    addMaterial: 'Tambah Material',
    searchMaterial: 'Cari material...',
    suggestedMaterials: 'Material yang disarankan...',
    bomRecipe: 'Resep BOM',

    // BOM Details
    bomDetails: 'Detail BOM',
    bomItems: 'Item BOM',
    inputMaterial: 'Material Masuk',
    quantityRequired: 'Jumlah Dibutuhkan',
    unit: 'Satuan',

    // Production Requests
    productionRequests: 'Papan Permintaan FG',
    incomingRequests: 'Papan Permintaan FG',
    noRequests: 'Tidak ada permintaan FG',
    processRequest: 'Proses Permintaan',
    createWorkOrder: 'Buat SPK',

    // Order Detail
    orderDetail: 'Detail Pesanan',
    addOutput: 'Tambah Output',
    recordScrap: 'Catat Scrap Manual',
    recordScrapHelper:
        'Untuk scrap yang ditemukan di luar sesi log hasil produksi kiosk (mis. reject QC, ditemukan belakangan). Scrap yang tercatat saat log hasil produksi di kiosk sudah otomatis masuk ke daftar ini.',
    scrapSourceKiosk: 'Dari log kiosk',
    scrapSourceManual: 'Manual',
    recordQC: 'Catat QC',
    addIssue: 'Tambah Issue',
    batchIssue: 'Issue Batch',
    manualProcurement: 'Procurement Manual',
    deleteScrap: 'Hapus Scrap',
    voidExecution: 'Batalkan Eksekusi',
    childOrders: 'Pesanan Anak',
    selectItem: 'Pilih Item',
    issueReason: 'Alasan Issue',
    quantity: 'Jumlah',

    // Dispatch
    reassignMachine: 'Tugaskan Ulang Mesin',
    rescheduleOrder: 'Jadwalkan Ulang Pesanan',
    chooseMachine: 'Pilih mesin',
    newDate: 'Tanggal Baru',

    // Glossary
    workOrderGuide: 'Panduan SPK',
    overview: 'Ikhtisar',
    statusFlow: 'Alur Status',
    processes: 'Proses',
    quality: 'Kualitas',
    orderNumber: 'Nomor Pesanan',
    orderNumberDesc:
        'Identifier unik untuk setiap SPK (auto-generated atau manual)',
    bomFormula: 'BOM / Formula',
    bomFormulaDesc:
        'Resep produksi yang mendefinisikan apa yang diproduksi dan material yang dibutuhkan',

    // Record Scrap Dialog
    scrapDetails: 'Detail Scrap',
    itemScrapped: 'Item Discrap',
    confirmScrapRecord: 'Konfirmasi Catatan Scrap',
    machineSetupPlaceholder: 'contoh: Setup mesin',

    // Record QC Dialog
    addInspection: 'Tambah Inspeksi',
    qualityInspection: 'Inspeksi Kualitas',
    qcAssessment: 'Penilaian QC',
    result: 'Hasil',
    notes: 'Catatan',
    inspectionCommentsPlaceholder: 'Komentar inspeksi...',
    saveResult: 'Simpan Hasil',

    // Batch Issue Material Dialog
    transferMaterial: 'Transfer Material',
    issueMaterial: 'Terbitkan Material',
    transferMaterialsToStaging: 'Transfer Bahan ke Produksi',
    issueMaterialsAndUpdatePlan: 'Terbitkan Material & Perbarui Rencana',
    sourceLocation: 'Lokasi Asal Bahan',
    destinationLocation: 'Tujuan Transfer Bahan',
    destinationFromOrder: 'Dari Lokasi Pemakaian Bahan SPK',
    editOrderLocation: 'Ubah di SPK',
    changeOutputLocation: 'Ubah Lokasi Penyimpanan Hasil',
    reassignOutputLocation: 'Ubah Lokasi Penyimpanan Hasil',
    reassignOutputLocationHelp:
        'Lokasi ini tempat stok hasil produksi disimpan. Tujuan transfer bahan diatur terpisah.',
    selectOutputLocation: 'Lokasi Penyimpanan Hasil',
    saveOutputLocation: 'Simpan lokasi',
    outputLocationUpdated: 'Lokasi Penyimpanan Hasil SPK berhasil diubah.',
    outputLocationRisky:
        'Peringatan: gudang bahan baku / lokasi berisiko. Transfer bahan bisa gagal (asal = tujuan).',
    transferDirectionHint:
        'Stok dipindah dari Lokasi Asal Bahan → Tujuan Transfer Bahan. Bahan akan dipakai di lokasi tujuan.',
    backflushConsumeHint:
        'Bahan dipindahkan ke lokasi ini dan akan dipotong otomatis saat hasil produksi dicatat.',
    sourceDestinationSame:
        'Lokasi asal dan tujuan transfer sama. Ubah asal bahan, atau setel Lokasi Pemakaian Bahan di SPK.',
    materialHeader: 'Material',
    qtyToTransfer: 'Jumlah Transfer',
    qtyToIssue: 'Jumlah Diterbitkan',
    planned: 'Direncanakan',
    substitute: 'Pengganti',
    selectSubstitute: 'Pilih pengganti...',
    overrideSourceLocation: 'Ganti Lokasi Asal Bahan',
    sourcePerItem: 'Asal bahan',
    toDestination: 'Ke',
    defaultLocation: 'Lokasi Default',
    useGlobalSource: 'Ikuti asal otomatis',
    enablePerItemSource: 'Ubah asal bahan per material',
    disablePerItemSource: 'Kembali ke asal otomatis',
    outputLocation: 'Lokasi Penyimpanan Hasil',
    outputLocationHelp:
        'Lokasi stok hasil produksi. Bukan gudang bahan baku.',
    consumptionLocation: 'Lokasi Pemakaian Bahan',
    consumptionLocationHelp:
        'Tujuan transfer bahan dan tempat bahan dipotong otomatis saat hasil dicatat.',
    consumptionLocationUpdated:
        'Lokasi Pemakaian Bahan SPK berhasil diubah.',
    consumptionLocationLocked:
        'Lokasi Pemakaian Bahan sudah terpakai — bahan pernah ditransfer/dicatat di SPK ini.',
    consumptionLocationRisky:
        'Peringatan: gudang bahan baku / lokasi berisiko tidak boleh jadi Lokasi Pemakaian Bahan.',
    stock: 'Stok',
    fixShortage: 'Atasi Kekurangan',
    addSubstituteMaterial: 'Tambah Material Pengganti',
    quickStockAdjustment: 'Penyesuaian Stok Cepat',
    refreshStock: 'Segarkan Stok',
    editingRowsWarning:
        'Mengedit baris akan memperbarui Rencana Pesanan secara permanen.',
    undoDelete: 'Urungkan Hapus',
    removeRequirement: 'Hapus Kebutuhan',
    warningTargetWarehouse:
        'Peringatan: Lokasi Pemakaian Bahan ini gudang biasa, bukan lokasi produksi. Pastikan SPK diatur ke Lokasi Pemakaian Bahan yang benar.',
    wipSelfConsumptionHint: 'Stok WIP di lokasi ini — tidak perlu transfer',
    wipSelfConsumptionShortagePrefix: 'Kurang',
    wipSelfConsumptionShortageSuffix:
        'perlu produksi tambahan sebelum SPK ini bisa dipenuhi',
    wipSelfConsumptionSubmitError:
        'Ada bahan WIP yang stoknya belum cukup di lokasi ini. Ini bukan soal "pilih gudang sumber" — perlu produksi tambahan (SPK Mixing) dulu sebelum SPK ini bisa dipenuhi.',
    packagingFloorStock: 'Sisa di lokasi produksi',
    packagingTransferRounded: 'Transfer dibulatkan ke kontainer utuh',
    packagingFloorStockCoversPlan:
        'Sisa di lokasi produksi sudah cukup — tidak perlu transfer baru',

    // Ad-Hoc Material Usage Dialog (Path A — ideally from Warehouse)
    recordAdHocUsage: 'Catat Pemakaian Bahan',
    adHocUsageHelp:
        'Untuk bahan dari gudang RM (mis. pelembab). Stok langsung berkurang & masuk HPP WO. Idealnya dicatat oleh gudang di modul Warehouse.',
    adHocMaterial: 'Bahan Ad-Hoc',
    selectAdHocMaterial: 'Pilih bahan...',
    adHocReason: 'Alasan (opsional)',
    adHocReasonPlaceholder: 'contoh: pelembab tambahan saat produksi',
    recording: 'Mencatat...',
    nonPlanBlockedInExtrusi:
        'Bahan di luar plan (biasanya dari gudang RM): gunakan Catat Pemakaian Bahan di modul Gudang agar stok & HPP langsung benar. Jangan transfer staging seperti Mixing HD.',

    // Capping warnings
    cappedItemsTransferWarning:
        'Beberapa bahan dipangkas ke rencana terbaru. Stok sudah terlanjur pindah — cek selisih di bawah.',
    cappedItemsIssueWarning:
        'Beberapa bahan dipangkas ke rencana terbaru. Cek selisih di bawah.',

    // Dual-path ownership callouts on production Materials tab
    materialPathFloorTitle: 'Jalur lantai (WIP)',
    materialPathFloorHelp:
        'Compound/roll antar proses dikelola produksi. Transfer Material di sini untuk staging Mixing→Extru/Packing. Tidak perlu pengajuan gudang RM per stage.',
    materialPathWarehouseTitle: 'Jalur gudang (bahan baku)',
    materialPathWarehouseHelp:
        'Resin, pelembab, dan bahan dari gudang RM dikeluarkan oleh gudang di modul Warehouse. Produksi melihat kebutuhan di sini; pengiriman RM lewat antrean gudang.',
    openWarehouseForRm: 'Buka modul Gudang (kirim RM / pelembab)',
    materialPathAdHocHint:
        'Pelembab atau additive dari gudang RM: catat di Gudang → Catat Pemakaian Bahan (bukan transfer WIP).',

    // Manual Procurement Dialog
    procureMaterials: 'Pengadaan Material',
    selectMaterialsDescription:
        'Pilih material dari SPK ini untuk membuat Permintaan Pembelian.',
    select: 'Pilih',
    plannedHeader: 'Rencana',
    qtyToProcure: 'Jumlah Diadaan',
    priority: 'Prioritas',
    normal: 'Normal',
    urgent: 'Mendesak',
    additionalNotes: 'Catatan tambahan untuk Pembelian...',
    purchaseRequestInfo:
        'Ini akan membuat Permintaan Pembelian baru untuk tim Pembelian. Tidak akan membuat Pesanan Pembelian secara langsung.',
    creatingPR: 'Membuat PR...',
    createPurchaseRequest: 'Buat Permintaan Pembelian',

    // Child Order List
    workOrders: 'SPK',
    requiresProduction: 'Perlu Diproduksi',
    creating: 'Membuat...',
    activeWorkOrders: 'SPK Aktif',
    availableStock: 'Stok Tersedia',
    stockSufficientHint: 'Stok cukup — transfer saja, tidak perlu SPK baru',
    stockPartialHint: 'Stok sebagian tersedia, sisanya baru perlu SPK',
    checkingStock: 'Cek stok...',

    // Delete Scrap Button
    deleteScrapRecord: 'Hapus Catatan Scrap',

    // Acknowledge / Actions
    acknowledgeHandover: 'Konfirmasi Serah Terima',
    acknowledge: 'Konfirmasi',
    assignJob: 'Tugaskan Pekerjaan',
    reassign: 'Tugaskan Ulang',

    // Reassign Machine Button
    changeMachine: 'Ganti Mesin',
    assignMachine: 'Tugaskan Mesin',

    // Employee Actions
    editDetails: 'Edit Detail',

    // Machine Actions
    setActive: 'Aktifkan',
    setMaintenance: 'Atur Pemeliharaan',

    // Common
    save: 'Simpan',
    cancel: 'Batal',
    delete: 'Hapus',
    edit: 'Edit',
    create: 'Buat',
    search: 'Cari',
    filter: 'Filter',
    refresh: 'Segarkan',
    close: 'Tutup',
    back: 'Kembali',
    actions: 'Aksi',
} as const;
