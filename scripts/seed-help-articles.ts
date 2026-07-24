import { PrismaClient, HelpArticleStatus, HelpArticleSource } from '@prisma/client';
const mainDb = new PrismaClient();
interface SeedArticle {
  slug: string; title: string; summary: string; bodyMd: string; modules: string[]; tags: string[]; errorCodes: string[]; source: HelpArticleSource;
}
const seedArticles: SeedArticle[] = [
{
slug: 'cara-buat-sales-order',
title: 'Cara Buat Sales Order (SO)',
summary: 'Buat SO customer di Penjualan dengan intent picker, customer, gudang sumber, harga customer, dan limit kredit.',
bodyMd: `## Langkah Buat Sales Order

1. Buka **Penjualan → Sales Order**. Klik tombol **Pesanan Baru** di pojok kanan atas.
2. Pilih jenis pesanan:
   - **Kirim dari Stok** — barang sudah ada di gudang
   - **Produksi Dulu** — barang akan diproduksi setelah SO dikonfirmasi
   - **Maklon Jasa** — jasa titipan, hanya untuk item SERVICE
3. Isi form:
   - **Customer**: ketik nama customer di kolom pencarian. Klik "Tambah Customer Baru" jika belum ada.
   - **Gudang Sumber**: pilih gudang asal barang. Kosongkan untuk "Semua gudang". **Catatan:** wajib diisi sebelum konfirmasi SO.
   - **Tanggal Pesanan**: default hari ini.
   - **Catatan**: opsional, untuk catatan internal.
4. Tambah item pesanan:
   - Klik **+ Tambah Item**.
   - Cari produk di kolom pencarian, pilih produk yang diinginkan.
   - Isi **Jumlah** dan **Harga Satuan**. Harga otomatis terisi dari harga khusus customer jika ada.
   - Atur **Diskon** (persen atau nominal) dan **Pajak** jika diperlukan.
   - Ulangi untuk setiap item.
5. Periksa banner **Kredit** di atas form. Jika merah, batas kredit customer akan terlampaui — kurangi qty atau minta admin naikkan limit.
6. Klik **Simpan**. SO akan berstatus **DRAFT**.

## Setelah Simpan

- SO berstatus DRAFT. Buka detail SO untuk melihat tombol aksi.
- **Konfirmasi Order** — ubah status ke CONFIRMED (lihat artikel "Cara Confirm SO Stok Kurang" jika stok kurang).
- **Edit** — ubah SO selama masih DRAFT.
- **Hapus** — hapus SO DRAFT yang tidak diperlukan.
- **Buat Surat Jalan** — buat pengiriman jika SO sudah dikonfirmasi.
- **Tambah ke Jadwal** — masukkan ke jadwal kirim mingguan.

## Tips

- Produk tidak muncul? Cek **Katalog Produk** pastikan variant aktif.
- Mau buat SO yang sama dengan yang lalu? Buka SO lalu klik **Pesan Ulang**.
- SO tanpa customer (legacy) tidak bisa dibuat invoice.

## Troubleshooting

- **"Source location is required"** → edit SO, pilih gudang sumber.
- **CREDIT_LIMIT_EXCEEDED** → kurangi qty SO atau minta admin naikkan limit kredit customer.
- **Customer tidak muncul** → cek di Penjualan → Customer, pastikan customer aktif.
- **Invoice tidak bisa dibuat** → pastikan status SO sudah SHIPPED/DELIVERED dan punya customer.

### Catatan Teknis

Intent picker: MAKE_TO_STOCK / MAKE_TO_ORDER / MAKLON_JASA. Path: /sales/orders/create?intent=stock|produce|maklon. lockedOrderType mengunci tipe pesanan.

Gudang Sumber: label dinamis "Gudang Sumber (Opsional)" vs "Gudang Customer" untuk Maklon. Options filtered by locationPurpose. Sentinel "__none__" = Semua gudang.

Line items: dual-unit jika salesUnit != primaryUnit. Diskon toggle PERCENT vs NOMINAL. Pajak checkbox "Kena Pajak" → DPP + PPN. Custom item via prefix "custom:".

Credit check: getCustomerCreditExposureAction → Limit, Piutang, SO aktif, Exposure, Sisa headroom. Merah jika over, kuning jika >90%.

Status flow: DRAFT → CONFIRMED → IN_PRODUCTION → READY_TO_SHIP → SHIPPED → DELIVERED.
`,
modules: ['sales'], tags: ['sales-order','so','pesanan-baru'], errorCodes: ['CREDIT_LIMIT_EXCEEDED'], source: 'SEED' as HelpArticleSource,
},
{
slug: 'cara-confirm-so-stok-kurang',
title: 'Cara Confirm SO Ketika Stok Kurang',
summary: 'Confirm SO tidak hard-fail — reservasi parsial plus shortage masuk Papan Permintaan FG, bukan error Insufficient Stock.',
bodyMd: `## Langkah Confirm Sales Order

1. Buka detail SO yang berstatus DRAFT. Klik tombol **Konfirmasi Order** (biru).
2. Sistem akan memeriksa:
   - **Limit kredit** customer — jika melebihi, muncul error CREDIT_LIMIT_EXCEEDED.
   - **Stok tersedia** — sistem cek stok di gudang sumber untuk setiap item.
3. Jika stok cukup: status berubah ke **CONFIRMED**. Stok langsung direservasi (dipesan) untuk SO ini.
4. Jika stok kurang untuk beberapa item:
   - Status berubah ke **IN_PRODUCTION** (jika ada BOM default).
   - Item yang stoknya kurang masuk ke **Papan Permintaan FG** di Produksi.
   - Sistem menampilkan warning: "Kekurangan stok masuk antrian produksi."
5. Jika tidak ada BOM default untuk item yang kurang: warning muncul, status tetap CONFIRMED. Buat BOM dulu di Katalog Produk.

## Solusi Saat Stok Kurang

**Opsi 1 — Buat SPK dari Papan Permintaan FG (disarankan):**
1. Buka **Produksi → Permintaan FG**.
2. Klik item yang perlu diproduksi → **Buat SPK**.
3. Isi form SPK dan simpan. Setelah produksi selesai, stok bertambah.

**Opsi 2 — Kurangi qty SO:**
1. Edit SO selama masih DRAFT.
2. Kurangi jumlah item sesuai stok yang tersedia.
3. Simpan dan konfirmasi ulang.

**Opsi 3 — Cek barang masuk:**
1. Buka **Stok → Penerimaan Barang** untuk cek antrean PO yang sedang dikirim.
2. Terima barang jika sudah datang, lalu konfirmasi SO lagi.

## Cara Cek Stok

1. Buka **Stok → Stok**.
2. Lihat kolom **Tersedia** = Stok - Terpesan.
3. Filter **Stok Menipis** untuk lihat item yang perlu reorder.

## Tips

- Sebelum confirm, cek stok dulu di Stok → Stok.
- Atur **Minimum Stok Alert** di Katalog Produk untuk peringatan dini.
- Reservasi stok otomatis saat confirm — stok "Terpesan" bertambah.

## Troubleshooting

- **CREDIT_LIMIT_EXCEEDED** → kurangi qty atau minta admin naikkan limit di Pengaturan → Customer.
- **"Source location is required"** → edit SO, pilih gudang sumber.
- **MISSING_DEFAULT_BOM** → buat BOM di Katalog Produk → BOM/Formula.
- **FG_DEMAND_QUEUED** → info, bukan error. Cek Produksi → Permintaan FG.

### Catatan Teknis

Confirm flow di orders-service.ts: validasi draft status → credit check → bulk inventory fetch → per-item reservation (7 hari) → shortage detection → soft BOM check → auto WO jika env AUTO_CREATE_WO_ON_SO_CONFIRM=true.

Status transition: DRAFT → CONFIRMED (stok cukup) atau DRAFT → IN_PRODUCTION (ada shortage + BOM). MTO/Maklon langsung IN_PRODUCTION.

Reservation: createStockReservation reservedFor SALES_ORDER, referenceId = order.id, reservedUntil +7 hari.

Error codes: CREDIT_LIMIT_EXCEEDED, MISSING_DEFAULT_BOM (warning), FG_DEMAND_QUEUED (info), WO_CREATE_FAILED (warning).
`,
modules: ['sales','warehouse','production'], tags: ['stok-kurang','confirm-so','reservasi'], errorCodes: ['CREDIT_LIMIT_EXCEEDED','MISSING_DEFAULT_BOM','FG_DEMAND_QUEUED','WO_CREATE_FAILED'], source: 'SEED' as HelpArticleSource,
},
{
slug: 'cara-jadwal-kirim-dan-surat-jalan',
title: 'Cara Atur Jadwal Kirim & Buat Surat Jalan',
summary: 'Jadwal Kirim dan Surat Jalan menu terpisah di Penjualan dengan flow draft PENDING LOADING SHIPPED dan verifikasi muat di Antrian Muat.',
bodyMd: `## Menu Terkait
- **Jadwal Kirim**: Penjualan → Jadwal Kirim
- **Surat Jalan**: Penjualan → Surat Jalan
- **Antrian Muat**: Stok → Antrian Muat (eksekusi gudang)

## Konsep Dasar
- Jadwal Kirim = mingguan per armada, trips = vehicles, stops = orders, unlinked = orders tanpa DO. Status DRAFT/Aktif/Selesai mapping ACTIVE=CONFIRMED/IN_TRANSIT/CLOSED=COMPLETED. Multi-toko rute harian.
- Surat Jalan DO = dokumen pengiriman resmi per SO, status PENDING (Menunggu draft muat stok belum dipotong) → LOADING (Sedang Dimuat) → SHIPPED (Dikirim stok terpotong) → IN_TRANSIT → ARRIVED → DELIVERED → RETURNED/CANCELLED terminal. State machine DELIVERY_TRANSITIONS & NEXT_STEP_LABELS: PENDING->Mulai Muat, LOADING->Tandai Dikirim, SHIPPED->Dalam Perjalanan, IN_TRANSIT->Sampai Tujuan, ARRIVED->Tandai Terkirim.

## Prasyarat
- SO CONFIRMED/IN_PRODUCTION/READY_TO_SHIP (DRAFT tidak bisa).
- Tidak ada SJ PENDING/LOADING aktif lain untuk SO sama → blok "Sudah ada Surat Jalan aktif" (salesLabels.openDoExists) atau "Sudah ada SJ aktif, residual 0" message noEligibleSoForDo.

## Jadwal Kirim Detail (ScheduleListClient)

1. Buka Penjualan → Jadwal Kirim /sales/delivery-schedules.
2. Klik Jadwal Baru → Dialog Buat Jadwal Baru: "Pilih tanggal untuk minggu jadwal yang ingin dibuat. Sistem akan otomatis menentukan awal (Senin) dan akhir (Minggu) minggu dari tanggal tersebut." Input type=date selectedDate required. Submit → createDeliverySchedule({ weekStart: new Date(selectedDate) }).
3. List Desktop Card Daftar Jadwal Badge count: filter status ALL/Draft/Aktif/Selesai (Select). Kolom No Jadwal (scheduleNumber link ke /sales/delivery-schedules/[id]), Periode weekStart — weekEnd locale id-ID (formatDate), Status badge (STATUS_STYLES/LABELS), Trip count, Stop count, Tanpa SJ (orange if >0 else green 0), Dibuat Oleh. Mobile Card serupa.
4. Detail jadwal /sales/delivery-schedules/[id] (ScheduleDetailClient) kelola trips: pilih Armada (Vehicle plateNumber name), assign orders, kelola stops, status etc.
5. Dari SO detail tambah ke jadwal.

## Buat Surat Jalan Single SO

1. Dari SO detail jika tidak ada SJ aktif → CreateDeliveryOrderDialog tombol Buat Surat Jalan (salesLabels.buatSuratJalan). Jika 1 SJ aktif → tombol Lihat SJ aktif (viewOpenDo) "Lihat SJ aktif (DO-xxx)" link ke /sales/deliveries/[id] atau /warehouse/outgoing/[id] jika warehouseMode. Jika >1 SJ aktif → info openDoExists + selectDoToShip.
2. Dialog SJ: pilih SO? defaultSalesOrderId prefill, cek sisa residual (sisa SO belum terkirim). Simpan → DO PENDING. Banner sjDraft "Surat Jalan (Draft/Muat)" + "Dokumen pengiriman — stok belum dipotong" (sjPendingHint) + sjPendingBanner "Draft muat — stok belum dipotong. Qty masih bisa disesuaikan dengan real lapangan sebelum Tandai Dikirim."
3. Edit qty lapangan: detail SJ PENDING/LOADING → Ubah qty kirim (editSjQty) → input number per item validation "Qty harus angka > 0" → Simpan qty (saveSjQty) success toast sjQtyUpdated "Qty Surat Jalan berhasil diperbarui." Help sjQtyHelp "Maksimal = sisa SO yang belum terkirim. Setelah Tandai Dikirim, qty tidak bisa diubah."
4. Kirim cepat: SO detail dropdown Lainnya → Buat SJ + Kirim Cepat (Create and Ship) via ShipmentDialog, ada next step commitExistingDo vs createAndShip.

## Eksekusi Gudang

1. Stok → Antrian Muat /warehouse/outgoing (WarehouseOutgoingPage). Filter active: PENDING or LOADING only, LOADING first then PENDING sort deliveryDate. Empty "Belum ada perintah muat. Tunggu Sales membuat Surat Jalan." Button Riwayat Kirim /warehouse/outgoing/history.
2. Detail /warehouse/outgoing/[id] (DeliveryOrderDetail warehouseMode true):
   - Badges & next step button: PENDING→LOADING "Mulai Muat", LOADING→SHIPPED "Tandai Dikirim" (tandaiDikirim) disabled unless load verified (canShip=isLoadVerified). Tooltip "Kunci verifikasi muat dulu".
   - Banner draft vs shipped: sjDraft vs sjShipped + banners.
   - StockReadinessBanner if FG not ready (fetchDeliveryStockReadiness action).
   - Item table with edit qty if canEditQty (PENDING/LOADING).
   - LoadVerifyPanel: title Verifikasi Muat desc "Cek qty fisik vs perintah muat. Kunci verifikasi sebelum Tandai Dikirim." Table Produk, Perintah qty (getEnteredQuantityDisplay), Dihitung/Dimuat input, Status badges Sesuai (Check green) / Selisih (AlertTriangle amber) / Belum dicek gray. Buttons Samakan semua ke perintah (Copy), Simpan Verifikasi, Kunci Verifikasi (Lock). Logic: allItemsVerified vs allItemsMatch (Math.abs planned-physical <0.0001). Handle saveDeliveryLoadVerification & confirmDeliveryLoadVerified. Success toasts "Qty verifikasi tersimpan", "Verifikasi terkunci. Siap Tandai Dikirim." Badge Terverifikasi.
   - After locked, Tandai Dikirim enabled → AlertDialog confirm: title "Tandai Dikirim?" desc tandaiDikirimConfirm "Ini akan memotong stok dari gudang. Pastikan produksi sudah diinput. Invoice draft akan dibuat otomatis." If not verified show amber warning "Verifikasi muat belum dikunci — lengkapi panel Verifikasi Muat dulu." Confirm → updateDeliveryStatus SHIPPED → stok terpotong, banner sjShippedBanner final.
   - Timeline card statusSteps PENDING→DELIVERED with icons Clock/Package/Truck/MapPin/CheckCircle etc.
   - Info cards: Customer, Asal Gudang, Tanggal Pengiriman, Disiapkan Oleh, Alamat Tujuan, Estimasi Berat.
   - Armada & Tarif card: Kendaraan plateNumber name, Kepemilikan Pabrik/Perorangan, Sopir, Rute, Tipe Tarif Per Kg/Flat, Est Berat, Biaya Ops/Rate, Charge Rate, Total Biaya Ops & Charge. Edit via EditDeliveryPricingDialog (hide warehouseMode).
   - Foto: Vehicle Photo statuses PENDING LOADING SHIPPED, POD statuses SHIPPED IN_TRANSIT ARRIVED DELIVERED. Upload to /api/upload/delivery-photo compressed then attachDeliveryPhoto. VehiclePhotoUrl & proofOfDeliveryUrl with Image unoptimized. ReceivedBy name required for POD.
   - Cetak: button Cetak Surat Jalan opens PrintPreviewModal landscape SuratJalanDotMatrixPrint.

## Void/Batal/Retur
- PENDING/LOADING: Batalkan button AlertDialog "Batalkan Delivery Order? ... tidak dapat diurungkan." → CANCELLED.
- SHIPPED/IN_TRANSIT/ARRIVED: Retur button "Tandai sebagai Retur?" → RETURNED, hidden in warehouseMode.
- After SHIPPED qty cannot edit, use Penjualan → Retur Penjualan /sales/returns.

## Tips
- Filter tanggal deliveries memakai deliveryDate, tapi SJ draft/pending selalu tampil (openSjPendingList).
- search SJ by nomor SJ or customer.
- Foto truk saat PENDING/LOADING, bukti terima after SHIPPED.
`,
modules: ['sales','warehouse'], tags: ['surat-jalan','jadwal-kirim','do','antrian-muat'], errorCodes: [], source: 'SEED' as HelpArticleSource,
},
{
slug: 'cara-terima-barang-gudang',
title: 'Cara Terima Barang di Gudang (Incoming)',
summary: 'Terima barang dari antrean PO SENT/PARTIAL dan walk-in Nota dengan form GoodsReceiptForm validasi over-receipt dan WAC.',
bodyMd: `## Menu Terkait
- **Penerimaan Barang**: Stok → Penerimaan Barang
- **Order Pembelian**: Pembelian → Order Pembelian

## Langkah Terima Barang dari PO: listReceivablePurchaseOrders (PO SENT/PARTIAL) + getGoodsReceiptsForDay today. serializeData.

## IncomingOperationalClient Real

- Header: Penerimaan Barang subtitle Lihat antrean & catat barang masuk dari supplier. Buttons Terima dari Nota (/warehouse/incoming/from-nota emerald bg-emerald-600) + Riwayat (/history outline).
- Card Menunggu Diterima: icon Truck blue, description PO yang sudah dikirim (SENT / partial) dan menunggu penerimaan di gudang. Badge count PO. Empty state ShoppingCart icon "Tidak ada PO menunggu. Barang datang tanpa PO? Terima dari Nota link emerald."
- Each PO row: font-mono orderNumber, Badge status getStatusLabel (purchasingStatusLabels DRAFT/SENT/PARTIAL_RECEIVED), badge Dari Nota jika isWalkInPurchaseOrderNotes(notes) amber, supplier Building2 icon name, item count, sisa totalRemaining if PARTIAL, expectedDate Calendar icon dd MMM yyyy. Button Terima / Terima Sisa bg-emerald-600 + ArrowRight link /warehouse/incoming/create-receipt?poId=id.
- Today receipts card if >0: PackageSearch icon Diterima Hari Ini, list receiptNumber mono emerald, orderNumber — supplier name, Dari Nota badge, ArrowRight link /warehouse/incoming/[id].

## Form Penerimaan (GoodsReceiptForm)

Path /warehouse/incoming/create-receipt?poId= (WarehouseCreateReceiptPage). Fetch PurchaseService.getPurchaseOrderById, getLocations. Map order.items → productName product.name || variant name, skuCode, orderedQty, receivedQty, unitPrice, unit enteredUnit || primaryUnit || pcs. Locations map id name.

Form:
- Resolver createGoodsReceiptSchema, default: purchaseOrderId, receivedDate new Date(), locationId defaultLocationId or '', notes "Penerimaan untuk pesanan {orderNumber}", items pendingItems.map orderedQty - receivedQty.
- pendingItems = all items (allow over-receiving: PO qty estimate, show all).
- Card Penerimaan Item header Package blue icon "Penerimaan Item" desc "Verifikasi kuantitas dan biaya untuk item yang diterima."
- Each field row border rounded bg-muted/30 or amber if over (bg-amber-50 border-amber-300). Inside: productName bold, sku mono, badges Dipesan orderedQty blue, Diterima Sblm emerald, Over amber bold if wouldBeTotal > orderedQty "Over: X > Y".
- Input Qty Masuk type text inputMode decimal rawQtyInputs state keeps raw string for comma/dot Indonesian. onChange parse raw replace comma dot Number, onBlur parseDecimalInput (function handles comma dot). class h-9.
- Input Biaya Satuan Aktual (Rp) same pattern rawCostInputs.
- Empty fields "Semua item telah diterima sepenuhnya." border dashed.
- Card Informasi Tambahan notes textarea placeholder "Kondisi barang, deviasi, dll." label notes.
- Header Penerimaan card: Destination Warehouse (purchasingLabels.destinationWarehouse label) Select location (getLocations), Tanggal Penerimaan date input type date value toISOString split T. Over receipt detection hasOverReceipt -> amber box Info icon "Over receipt terdeteksi: qty diterima melebihi PO. PO diperlakukan sebagai perkiraan, penerimaan akan tetap disimpan & stok bertambah." WAC info box amber "Konfirmasi penerimaan ini akan memperbarui tingkat stok otomatis dan menghitung kembali Weighted Average Cost (WAC)..." Button submit bg-blue-600 h-11 "Simpan Penerimaan Barang" with Download icon, disabled loading or fields empty. Loading "Memproses...".
- Checklist Verifikasi card slate bg CheckCircle emerald: Title Checklist Verifikasi uppercase tracking wider, bullets: Kuantitas sesuai hitungan fisik, Biaya satuan sesuai invoice supplier, Kualitas batch dapat diterima.
- onSubmit createGoodsReceipt action → if basePath includes /warehouse/incoming & receiptId → push /warehouse/incoming/[receiptId] else /purchasing/orders/[poId] + toast Penerimaan Barang berhasil dicatat.

## Jalur B Walk-in Nota
- /warehouse/incoming/from-nota: form supplier manual nota, item qty lokasi, Simpan → badge Dari Nota.

## Setelah Terima
- Stok di /warehouse/inventory bertambah (inventory quantity + WAC recalc).
- PO jadi PARTIAL_RECEIVED atau RECEIVED.
- Muncul di Diterima Hari Ini & Riwayat /history.

## Retur
- Penjualan → Retur Penjualan /sales/returns, Pembelian → Retur /purchasing/returns. Tidak ada Warehouse→Returns.

## Tips
- Selalu cek fisik sebelum Simpan.
- Over-receipt diperbolehkan, PO estimate.
- Jika PO tidak muncul di Menunggu Diterima cek Pembelian → Order Pembelian /purchasing/orders status SENT?
- Decimal input bisa koma Indonesia 247,62 parsed.
`,
modules: ['warehouse','purchasing'], tags: ['incoming','penerimaan','PO','walk-in'], errorCodes: [], source: 'SEED' as HelpArticleSource,
},
{
slug: 'cara-cek-stok-per-lokasi',
title: 'Cara Cek Stok Per Lokasi Gudang',
summary: 'Stok di Stok dengan WarehouseNavigator multi-select, kolom Stok Terpesan Tersedia, Filter tipe, Low Stock ?lowStock=true, ABC, dan mutasi history.',
bodyMd: `## Menu Terkait
- **Stok**: Stok → Stok
- **Transfer**: Stok → Transfer Stok
- **Penyesuaian**: Stok → Penyesuaian Stok
- **Opname**: Stok → Stock Opname

## Langkah Cek Stok

1. Buka **Stok → Stok**.
2. Pilih lokasi gudang di navigator atas (bisa multi-select).
3. Lihat kolom: **Produk**, **Lokasi**, **Stok** (fisik), **Terpesan** (reserved), **Tersedia** (stok - terpesan), **Status**.
4. Filter **Stok Menipis** untuk item yang perlu reorder.
5. Klik baris produk untuk lihat detail: riwayat mutasi, tren, transfer.

### Catatan Teknis

Page Logic (WarehouseInventoryPage)

- Parallel fetch: getInventoryStats (liveInventory), getLocations, getDashboardStats totalStock lowStockCount totalValue. canViewPrices permission.
- asOf & compareWith handling: getInventoryAsOf for historical, comparisonData map key productVariantId-locationId.
- activeLocationIds parse query locationId array.
- tableInventory = live or historical mapped quantity 0 if not found.
- processedInventory filter by activeLocationIds if any.
- ABC via ABCAnalysisService.calculateABCClassification → abcMap productVariantId→class.
- variantTotals reduce sum toDecimalNumber quantity per productVariantId.
- isTableGlobalLowStock: liveInventory find threshold minStockAlert toDecimalNumber, if threshold && variantTotals < threshold true.
- isLowStockFilter ?lowStock=true filter isTableGlobalLowStock.
- locationSummaries per location totalSkus lowStockCount via isLiveGlobalLowStock.
- displayedTotalStock vs dashboardStats.totalStock, internalDisplayValue vs customerOwnedDisplayValue per locationType CUSTOMER_OWNED.
- serializeData → InventoryTable props inventory variantTotals comparisonData showComparison initialDate initialCompareDate showPrices abcMap totalStock totalValue customerOwnedValue.

## UI

- Header flex: h1 Stok subtitle Pantau level stok dan status gudang. ContextualHelp title Panduan Stok prefill "Kenapa stok produk tidak cukup saat confirm SO?" links 3 artikel cara-cek-stok-per-lokasi, cara-terima-barang-gudang, error-backflush-atau-stok-bahan. InventoryQuickActions lowStockCount.
- WarehouseNavigator: locations summaries totalSkus lowStockCount basePath /warehouse/inventory, activeLocationIds multi.
- Card flex-1 min-h-0 border shadow-sm bg-card contains InventoryTable inventory variantTotals etc.
- InventoryTable: search "Cari produk / SKU..." (warehouseComponentLabels.searchProduct) + Quick Stock Check "Cari SKU..." (searchSku), Filter tipe All Types/Semua Tipe Bahan Baku/Barang Jadi/WIP/Scrap/Intermediate/Packaging/Service (warehouseComponentLabels). Selection checkbox bulk Select All, selected count, Bulk Actions Export Selected (exportSelected). TableHeaders Product Location Stock Reserved Available Status UnitCost StockValue. Rows noInventoryData etc.
- Low stock: filter chip or ?lowStock=true shows only variant totals < minStockAlert.
- Price column only if showPrices via canViewPrices (viewPrices permission). Access Control toggle Lihat Harga.
- ABC map maybe shows classification.
- Click row → /warehouse/inventory/[id] detail varian biaya lokasi breakdown chart Stock History "Riwayat Stok" desc "Tren pergerakan stok..."

## History & Mutasi

- /warehouse/inventory/history with dateRange Start/End (warehouseComponentLabels dateRange startDate endDate).
- Recent Transfers /warehouse/analytics history etc.
- Transfer: /warehouse/inventory/transfer form Transfer Stok Transfer dari satu lokasi ke lokasi lain From/To/Quantity confirmTransfer.
- Adjustment: /warehouse/inventory/adjustment form Penyesuaian Stok adjustStock desc Sesuaikan jumlah stok produk di lokasi tertentu selectProduct selectLocation adjustmentType addition/reduction reasonPlaceholder "contoh: Rusak, Expired, Ditemukan" quantity confirmAdjustment.
- Aging: Aging Stok stockAging title.
- Stock Opname: createOpname etc.

## Tips
- Tidak ada filter Stok Kritis generic lama — pakai lowStock filter.
- Export via bulk atau QuickActions.
- Untuk global sum jangan filter locationId lihat variantTotals.
- Threshold atur di Katalog Produk /dashboard/products variant minStockAlert field minStockAlert minStockAlertDesc + bestPracticeFormula.
- Customer-owned locations (Maklon) punya nilai terpisah customerOwnedValue — bukan milik pabrik.
`,
modules: ['warehouse'], tags: ['stok','inventory','lokasi'], errorCodes: [], source: 'SEED' as HelpArticleSource,
},
{
slug: 'cara-outgoing-muat-kirim',
title: 'Cara Proses Outgoing & Muat Kirim',
summary: 'Antrian Muat PENDING LOADING dengan StockReadinessBanner, edit qty lapangan, LoadVerifyPanel Samakan Kunci Verifikasi, Tandai Dikirim potong stok dan foto.',
bodyMd: `## Menu Terkait
- **Antrian Muat**: Stok → Antrian Muat
- **Riwayat Kirim**: Stok → Antrian Muat → Riwayat Kirim

## Langkah Proses Muat Kirim

1. Buka **Stok → Antrian Muat**. Lihat daftar Surat Jalan yang perlu diproses.
2. Status **Menunggu**: klik **Mulai Muat** untuk mulai memuat barang.
3. Status **Sedang Dimuat**: verifikasi qty fisik vs perintah:
   - Klik **Samakan semua ke perintah** jika qty sesuai.
   - Atau edit qty per item jika ada selisih.
   - Klik **Simpan Verifikasi** lalu **Kunci Verifikasi**.
4. Klik **Tandai Dikirim** — stok otomatis terpotong dan invoice draft dibuat.
5. Upload foto truk saat muat dan bukti terima setelah dikirim.

### Catatan Teknis

Alert: "Surat Jalan di bawah adalah perintah muat. Mulai muat → cek qty fisik vs perintah (verifikasi) → Tandai Dikirim (potong stok). SJ dibuat di Sales; gudang mengeksekusi di sini."

## Page WarehouseOutgoingPage

- getDeliveryOrders no filter → allOrders serializeData.
- openOrders filter status PENDING or LOADING active queue (outgoing). Sort LOADING first then PENDING by deliveryDate.
- Header Antrian Muat (warehouseLabels.outgoing) subtitle "Perintah muat (Surat Jalan) siap atau sedang diproses gudang." Button Riwayat Kirim /warehouse/outgoing/history (outgoingHistory + History icon).
- Alert blue border.Info: flow explanation.
- Card Perintah Muat (count). Empty: "Belum ada perintah muat. Tunggu Sales membuat Surat Jalan." Else DeliveryOrderTable initialData openOrders basePath /warehouse/outgoing mode active.

## Detail DeliveryOrderDetail (warehouseMode true)

- Props order DeliveryOrderDetailData fields id orderNumber salesOrderId status deliveryDate carrier trackingNumber notes destinationAddress vehiclePhotoUrl proofOfDeliveryUrl proofOfDeliveryAt receivedBy loadVerifiedAt loadVerifiedById loadingStartedAt estimatedWeightKg appliedRateType appliedRouteName appliedCostRate appliedChargeRate totalCost totalCharge vehicle {plateNumber name ownershipType driverName} salesOrder orderNumber customer name shippingAddress billingAddress sourceLocation name createdBy name items array id quantity enteredQuantity enteredUnit verifiedQuantity productVariant name skuCode primaryUnit product name etc.
- State: items = order.items ?? [], canEditQty = PENDING or LOADING, isLoadVerified = !!loadVerifiedAt, canShip = isLoadVerified, showPreview, uploadingVehicle/POD, receivedByName, stockReadiness state, editingQty qtyDraft Record id->string, savingQty, vehicleInputRef podInputRef router.
- Stock readiness useEffect: if PENDING/LOADING fetchDeliveryStockReadiness(order.id) server action no Prisma client → setStockReadiness StockReadinessLine[].
- Edit qty: startEditQty sets draft from quantity, handleSaveQty validation "Qty harus angka > 0" → updateDeliveryItemQuantities action deliveryOrderId items [{id quantity}] → toast sjQtyUpdated or error. Cancel edit.
- handleStatusChange: updateDeliveryStatus id newStatus → toast getDeliveryStatusLabel + refresh.
- NEXT_STEP_LABELS map status to next label real delivery-status.ts: PENDING {to LOADING label Mulai Muat}, LOADING {to SHIPPED label Tandai Dikirim}, SHIPPED {to IN_TRANSIT Dalam Perjalanan}, IN_TRANSIT {to ARRIVED Sampai Tujuan}, ARRIVED {to DELIVERED Tandai Terkirim}, DELIVERED null etc. DELIVERY_STATUS_LABELS mapping PENDING Menunggu LOADING Sedang Dimuat SHIPPED Dikirim etc.
- VEHICLE_PHOTO_STATUSES PENDING LOADING SHIPPED, POD statuses SHIPPED IN_TRANSIT ARRIVED DELIVERED.
- handlePhotoUpload compressImageForUpload then fetch /api/upload/delivery-photo FormData file deliveryOrderId photoType vehicle|proof_of_delivery publicUrl receivedBy if POD → attachDeliveryPhoto action → toast Foto truk/Bukti terima berhasil + refresh receivedByName clear.

## UI Sections

- Top: Back to basePath, header Delivery Order orderNumber (salesLabels.deliveryOrder) + status badge getStatusBadge styles yellow/orange/blue/indigo/teal/green/red/gray. If isLoadVerified && canEditQty badge green Muat terverifikasi. Next step button primary green Check icon label NEXT_STEP_LABELS.to unless SHIPPED special handling AlertDialog for Tandai Dikirim. Cancel button outline red XCircle Batalkan for PENDING/LOADING AlertDialog "Batalkan Delivery Order? ... tidak dapat diurungkan." Return button orange RotateCcw Retur for SHIPPED IN_TRANSIT ARRIVED hidden warehouseMode "Tandai sebagai Retur? DO ... akan ditandai RETURNED. Pastikan barang sudah kembali." Link to salesOrder /warehouse/outgoing/orders/[salesOrderId] or /sales/orders/[salesOrderId] if not warehouseMode. Cetak Surat Jalan button Printer opens PrintPreviewModal title Surat Jalan orderNumber landscape true contains SuratJalanDotMatrixPrint showButton false previewMode companyConfig.
- Explainer banners if canEditQty amber border sjDraft sjPendingBanner, if SHIPPED emerald sjShipped sjShippedBanner.
- StockReadinessBanner if stockReadiness length>0.
- Tracking Banner if SHIPPED or IN_TRANSIT blue bg: icon Truck "Pengiriman dalam Perjalanan" carrier trackingNumber.
- Main grid md 3 cols: 2 cols Item Pengiriman Card header title Item Pengiriman description sjQtyHelp if canEditQty else "Item yang termasuk dalam batch pengiriman ini" + button Ubah qty kirim / Batal + Simpan if editingQty. Table Produk SKU Qty (maybe enteredUnit). Editing renders Input number step 0.01 min 0.01 h-8 w-28 + unit label.
- Then if canEditQty LoadVerifyPanel: Card Verifikasi Muat desc "Cek qty fisik vs perintah muat. Kunci verifikasi sebelum Tandai Dikirim." or "Verifikasi sudah terkunci." Badge Terverifikasi green Check if isVerified. Table Produk, Perintah qty getEnteredQuantityDisplay (quantity enteredUnit primaryUnit), Dihitung/Dimuat Input if canEdit else display verifiedQuantity via getEnteredQuantityDisplay else '-', Status Badge Sesuai green Check / Selisih amber AlertTriangle / Belum dicek gray. Actions if canEdit: Samakan semua ke perintah button Copy icon handleMatchAll sets verifyDraft to planned quantities, Simpan Verifikasi button disabled saving or !allItemsVerified, Kunci Verifikasi green bg-green-600 Lock icon disabled confirming or !allItemsMatch or isVerified. handleSave calls saveDeliveryLoadVerification deliveryOrderId items payload id verifiedQuantity Number, toast Qty verifikasi tersimpan etc + refresh. handleConfirm checks allItemsMatch else toast "Semua baris harus sesuai perintah sebelum dikunci" then save draft then confirmDeliveryLoadVerified. getItemStatus pending/match/mismatch via Math.abs(planned-physical)<0.0001.
- Timeline Card Timeline before pseudo element, statusSteps array PENDING Pesanan Terkonfirmasi Clock, LOADING Sedang Dimuat Package, SHIPPED Dikirim Truck, IN_TRANSIT Dalam Perjalanan MapPin, ARRIVED Sampai Tujuan CheckCircle, DELIVERED Diterima CheckCircle2. isCompleted idx <= currentStatusIndex. Show time for LOADING? Actually format deliveryDate for idx1 if completed.
- Sidebar: Informasi Pengiriman Card Customer name shippingAddress, Asal Gudang sourceLocation name, Tanggal Pengiriman format PPP, Disiapkan Oleh createdBy name or Sistem, Alamat Tujuan destinationAddress or customer shipping/billing, Estimasi Berat estimatedWeightKg Kg if exists. Notes card if present border-left yellow.
- Armada & Tarif card Truck icon title Armada & Tarif + EditDeliveryPricingDialog if not warehouseMode & not CANCELLED. Grid 2 cols Kendaraan plateNumber — name, Kepemilikan Pabrik/Perorangan, Sopir driverName, Rute appliedRouteName or Semua Rute, Tipe Tarif Per Kg/Flat Rate/—, Est Berat, Biaya Ops/Rate format currency IDR, Charge Rate, Total Biaya Ops, Total Charge emerald. Border top if totalCost/totalCharge not null.
- Foto Pengiriman Card Camera icon. Grid 2 cols Vehicle Photo: label Foto Truk Saat Muat, if vehiclePhotoUrl Image fill unoptimized object-cover h-48 border rounded overflow else dashed "Belum ada foto truk". If canUploadVehicle (PENDING LOADING SHIPPED) hidden input file image/jpeg/png/webp ref, Button outline Upload icon "Mengupload..." text Ganti Foto Truk or Upload Foto Truk.
- Proof: label Bukti Terima, image if proofOfDeliveryUrl plus receivedBy & proofOfDeliveryAt formatted PPpp, else dashed "Belum ada bukti terima". If canUploadPOD (SHIPPED IN_TRANSIT ARRIVED DELIVERED) input nama penerima required, file input, Button disabled uploadingPOD or !receivedByName.trim() label Upload Bukti Terima.

## Hapus/Void Generik
- Seed lama bilang Void dengan alasan generic — real Batalkan CANCELLED via AlertDialog, tidak ada void reason field (kecuali mungkin di action but not UI). Untuk retur RETURNED.

## Tips
- Jika stok tidak cukup saat verifikasi cek Stok Terpesan tinggi reservasi SO lain atau produksi belum input output.
- SJ portal gudang perintah muat only, master dokumen SJ di Penjualan.
- Edit qty max residual, after SHIPPED cannot edit must Retur via sales.
- Print dotmatrix uses companyConfig from getCompanyConfigWithOverridesAsync.
`,
modules: ['warehouse','sales'], tags: ['outgoing','antrian-muat','verifikasi-muat'], errorCodes: ['STOCK_INSUFFICIENT'], source: 'SEED' as HelpArticleSource,
},
{
slug: 'cara-spk-batch-harian',
title: 'Cara Buat SPK Batch Harian Produksi',
summary: 'Buat SPK di Produksi SPK dengan stepper Spesifikasi Lokasi Review, lifecycle DRAFT WAITING_MATERIAL RELEASED IN_PROGRESS COMPLETED CANCELLED.',
bodyMd: `## Menu Terkait
- **SPK**: Produksi → SPK
- **Buat SPK**: Produksi → SPK → Buat SPK

## Status SPK
- **Draft** — belum diproses
- **Menunggu Bahan** — stok bahan belum cukup
- **Siap Produksi** — sudah dirilis, siap dikerjakan
- **Sedang Diproduksi** — sedang berjalan
- **Produksi Selesai** — selesai
- **Dibatalkan** — dibatalkan

## Langkah Buat SPK

1. Buka **Produksi → SPK**. Klik **Buat SPK**.
2. **Step 1 — Spesifikasi**: pilih produk, resep (BOM), mesin, tanggal mulai, target qty.
3. **Step 2 — Lokasi**: pilih lokasi output. Jika Maklon, pilih customer.
4. **Step 3 — Review**: periksa ringkasan, klik **Buat SPK**.
5. SPK berstatus DRAFT atau Menunggu Bahan (jika stok kurang).

## Lifecycle SPK

1. **Rilis SPK** — ubah status ke Siap Produksi.
2. **Mulai Produksi** — ubah status ke Sedang Diproduksi.
3. **Catat Hasil** — tambah output, catat scrap jika ada.
4. **Selesai SPK** — ubah status ke Produksi Selesai.

### Catatan Teknis

List Page (ProductionOrdersPage)

- Build href preserves category status q late.
- validStatuses array includes WAITING_MATERIAL.
- isLateFilter late=1.
- getProductionOrders with bomCategories mapping mixing->MIXING, extrusion->EXTRUSION+STANDARD, packing->PACKING, rework->REWORK, status, q, late.
- Stats cards: Total SPK (totalOrders) with Layers icon, Sedang Diproses (IN_PROGRESS) Activity emerald, Siap Dirilis (readyToRelease) "Draft + Siap + Tunggu Bahan" Clock blue, Terlambat lateOverdue AlertCircle red. Clickable links with ring primary when active filter. late filter red ring.
- Category TabsList inline-flex: Semua Mixing Extrusion Packing Rework Links.
- Status chips: Semua status + ALL_STATUSES map getStatusLabel(s,production) + Terlambat chip red.
- Search form GET method: Search icon Input name q placeholder searchSpkPlaceholder aria-label Cari SPK, X clear link if searchQuery, Button Cari.
- Table: No SPK (orderNumber link), Produk name + priority badge ProductionPriorityBadge + Maklon badge if isMaklon blue outline, BOM name, Status ProductionStatusBadge, Sumber Permintaan customer name or orderNumber orderType or Stock Internal badge internalStockBuildLabel, Mesin Badge code or -, Progress Progress bar Math.min(progress,100) h-2 w-16 + % text, Rencana getEnteredQuantityDisplay plannedQuantity plannedEnteredQuantity conversionFactor, Tanggal Mulai format d MMM yyyy id locale, Aksi ChevronRight link. Empty: noSpkFound + Hapus Filter + Buat SPK.

## Form Create (ProductionOrderForm)

- Path /production/orders/create. Props locations slug name locationPurpose, machines id name type, boms id name isDefault productVariantId category outputQuantity productVariant name primaryUnit salesUnit conversionFactor productType etc, customers, rawMaterials, salesOrderId, variantId, qtyHint, priorityHint.
- formSchema createProductionOrderSchema, defaultValues plannedQuantity 0 plannedStartDate new Date() items [] locationId bomId machineId salesOrderId notes isMaklon false estimatedConversionCost 0 priority NORMAL.
- Hooks: useCreateSpkDefaults locations stage isMaklon → sourceLocationId defaultSourceId outputLocationId activeLocations isRiskyOutput isRecommendedOutput. usePlanningIntent bomOutputQty productVariant baseQty → planningMode batch/weight/sales, batchCount, enteredTargetQty, unitMeta hasAlternateUnit salesUnit conversionFactor. useBomMaterialPreview bomId sourceLocationId plannedQty debounce 500 → items materialInfo suggestedSource isCalculating. useCompatibleMachines machines stage.
- Derived products map variantId name filtered by stage category.
- availableBoms filtered by selectedProductVariantId + stage.
- outputIsRisky isRiskyOutput(watchLocationId) etc sourceLocationName.
- getEffectiveQty: if batch → batchCount*bomOutputQty else if sales alternate → toBaseQuantity(enteredTargetQty, conversionFactor) else watchPlannedQty.
- Effects: seed form.items from preview when settled if not dirty (itemsDirtyRef), clear when empty, reset dirty on qty/source changes, auto-select product if 1, auto-select BOM if 1, default output location, reset riskyConfirmed on location change, prefill variantId → map stage from BOM category stageFromBomCategory setStage selectedProductVariantId bomId locationId via resolveOutputLocationId, qtyHintRef apply plannedQuantity once, priorityHint.
- Display items: form items if present else preview. mergedMaterialInfo rawMaterials meta + preview info. hasStockIssues check preview materialInfo currentStock.
- Step 1 Spesifikasi: StageProductSection StageProductSection props stage onStageChange products selectedProductId onProductChange boms selectedBomId onBomChange selectedBom machines selectedMachineId onMachineChange plannedStartDate onDateChange plannedEndDate onEndDateChange. PlanningQuantitySection props planningMode onPlanningModeChange batchCount etc bomOutputQty. MaterialPreviewPanel sourceLocationName items displayItems materialInfo suggestedSource isCalculating hasStockIssues onAcceptSuggestedSource editable rawMaterials onItemQtyChange onAddItem onRemoveItem.
- Step 2 Lokasi & Meta: LocationFlowCard stage sourceLocationName outputLocationId onOutputLocationChange activeLocations recommendedOutputId recommendedOutputName outputIsRisky outputIsRecommended outputManuallyOverridden onResetToDefault. MaklonSection form isMaklon onMaklonChange customers. OrderMetaSection form salesOrderId.
- Step 3 Review & Buat: ReviewCommitSection stageLabelId(stage) productName bomName targetSummary machineName startDate formatLocalDate endDate sourceName outputName priority isMaklon predictedStatus MENUNGGU_BAHAN if hasStockIssues else DRAFT outputIsRisky isSubmitting isCalculating isFormValid.
- Navigation: Batal router.back, Kembali step-1, Lanjut → validation canAdvanceFromStep1 bomId && getEffectiveQty>0 else toast "Pilih produk, resep, dan target > 0", canAdvanceFromStep2 locationId && (!isMaklon || maklonCustomerId) else toast "Lengkapi lokasi output" → setStep+1.
- Shared submit doSubmit riskAck: calc effectiveQty inline, check >0 else warning "Target produksi harus lebih dari 0", check isCalculating warning "Tunggu perhitungan bahan selesai", if outputIsRisky && !riskAck → showRiskyDialog. setIsSubmitting then createProductionOrder with locationId materialSourceLocationId effectiveSourceId plannedQuantity effectiveQty plannedEnteredQuantity etc items formItems createPath sales_order/demand_board/manual. Response data status WAITING_MATERIAL ? "Menunggu Bahan" else "DRAFT" toast "SPK {orderNumber} berhasil dibuat Status: {statusLabel}" push /production/orders/[id].
- Risky dialog RiskyOutputConfirmDialog open onOpenChange outputName onConfirm handleRiskyConfirm sets riskyConfirmed true + doSubmit(true).
- Form hidden salesOrderId.

## Lifecycle Real (order-status-actions.tsx)

- ExtendedProductionOrder includes materialIssues executions shifts etc formData locations operators helpers workShifts machines rawMaterials.
- handleDelete toast.promise deleteProductionOrder Menghapus SPK… success push /production/orders.
- transition nextStatus toastMsg → updateProductionOrder id status → toast + refresh.
- canCancel = (RELEASED or IN_PROGRESS) && materialIssues length 0 && executions length 0 && Number(actualQuantity||0)==0 → AlertDialog Batalkan SPK description "Ini akan mengubah status SPK menjadi Dibatalkan. Karena belum ada material yang dikeluarkan dan belum ada output yang dicatat, ini aman untuk menutup SPK duplikat atau yang tidak diperlukan." Button Konfirmasi Pembatalan red.
- DRAFT/WAITING_MATERIAL: Trash icon delete + Button Rilis SPK → transition RELEASED.
- RELEASED: cancelDialog + Mulai Produksi → IN_PROGRESS.
- IN_PROGRESS: cancelDialog + AddOutputDialog order formData + Selesai SPK outline → COMPLETED.
- COMPLETED disabled Selesai, CANCELLED disabled red SPK Dibatalkan.

## Tabs di Detail SPK (production-order-detail)

- Overview tab, Materials tab (OrderMaterialsTab), Execution tab (order-execution-tab) AddOutputDialog etc, Issues, Costing (order-costing-tab), etc.
- MaterialsTab: ChildOrderList, waiting banner amber Package icon "SPK menunggu bahan — cek kebutuhan di bawah. Path A (Mixing): pengambilan bahan baku di Gudang..." Buka Gudang link /warehouse external. Active info Path A vs Path B floor_wip vs gudang. resolveMaterialPath(category) floor_wip vs ... Buttons ManualProcurementDialog + BatchIssueMaterialDialog if isActive && isFloorPath (floor_wip). Table Kebutuhan Bahan thead Bahan Rencana Keluar Selisih. Body plannedMaterials map item productVariant name badge Rencana blue sku, required fixed 2 primaryUnit, issued = manualIssued + backflushedQty (if !hasExplicitIssues && isBackflushCategory MIXING EXTRUSION PACKING REWORK && actualQty>0 && plannedQty>0 then backflushed = actual/planned*required) variance issued-required variancePercent color bg-emerald/red/amber progress bar. Substitute materials filtered materialIssues not in plannedMaterials group by variantId sum quantity yellow bg badge Diluar rencana badge Pengganti amber. Riwayat Pengeluaran grid materialIssues status VOIDED opacity line-through bg-muted/30 etc issuedAt formatted d MMM yyyy HH:mm id locale quantity primaryUnit.
- Execution tab: Backflush hint "Stok akan dikonsumsi otomatis saat Anda mencatat output (Backflush)." etc.
- AddOutputDialog: Dialog Catat Hasil Produksi grid 2 cols Left BrandCard Context & Team with Tercatat Pada now locale medium short, Shift select from shiftOptions (ProductionShift) if none message "Belum ada shift di SPK — tambah dulu di tab Sumber Daya" + active shift by time matchedShift, Operator select, Helper multi select Ctrl/Cmd, Right columns Good Quantity card with Total goodQuantity displayUnit, input Enter Roll Size/Qty displayUnit Add button, rolls grid no rolls empty Package icon "No rolls recorded...", each roll card with index weight displayUnit Trash2 hover. Scrap card Affal Prongkol/Daun kg inputs, warning banner if both 0 and !showScrapWarning "Scrap masih 0 Apakah yakin tidak ada affal/scrap?" buttons Isi Scrap vs Ya Tidak Ada Scrap. Notes textarea Catatan/Komentar placeholder. Footer Batal + Catat Hasil disabled if submitting or rolls empty && !scrap. doSubmit finalNotes append helpers names + auto-generated rolls, data quantityProduced baseQty etc enteredQuantity if alternate etc, call addProductionOutput.
- Also ManualProcurementDialog for MRP etc.

## Tips
- Pastikan BOM benar di Produksi → BOM/Formula alias /dashboard/boms or /production/boms.
- Jika warning "Peringatan: gudang bahan baku / lokasi berisiko. Transfer staging bisa gagal (asal = tujuan)." atau "Target kemungkinan Gudang. Pastikan Pesanan ini diatur ke Lokasi Produksi." → ganti ke produksi/staging.
- QtyHint variantId prefill dari Papan Permintaan FG query ?variantId=&qty=&priority.
- Source per item override enablePerItemSource/disablePerItemSource.
- Output risky confirm dialog.

## Backflush
- Consume otomatis saat catat output execution, materials tab shows backflushedQty derived.
- Jika backflush gagal stok bahan kurang → cek Materials shortage, top up via gudang.
`,
modules: ['production'], tags: ['spk','work-order','batch','lifecycle'], errorCodes: ['MATERIAL_INSUFFICIENT','BACKFLUSH_FAILED'], source: 'SEED' as HelpArticleSource,
},
{
slug: 'cara-input-hasil-kiosk',
title: 'Cara Input Hasil Produksi via Kiosk',
summary: 'Kiosk di /kiosk hub operator, /kiosk/jobs list dengan timer 30s filter mesin barcode, /kiosk/jobs/[orderId] wizard Catat Hasil Qty Bagus Prongkol Daun Foto Konfirmasi.',
bodyMd: `## Akses Kiosk
- Buka `/kiosk` di tablet/HP operator.
- Pilih nama operator saat pertama kali.
- Pilih mode: **Produksi/SPK**, **Absensi**, **Proses Khusus**, atau **Status Saya**.

## Langkah Catat Hasil Produksi

1. Buka **Produksi/SPK** di Kiosk Hub.
2. Pilih SPK yang sedang dikerjakan (status harus Siap Produksi atau Sedang Diproduksi).
3. Klik **Mulai SPK** jika belum mulai.
4. Klik **Catat Hasil**:
   - Isi **Jumlah Bagus** (qty output).
   - Isi **Scrap** (Prongkol/Daun) jika ada.
   - Upload **Foto** bukti produksi.
   - Klik **Kirim Hasil**.
5. Sistem otomatis mengonsumsi bahan (backflush) dan memperbarui stok.

### Catatan Teknis

Menu Kiosk: /kiosk (KioskHub), /kiosk/jobs (KioskJobList), /kiosk/jobs/[orderId] (KioskJobFocus), /kiosk/attendance, /kiosk/production/hd, /kiosk/production/potongplong, /my
Auth: sessionStorage kiosk_operator_id

- getData withTenant: employees findMany status ACTIVE role OPERATOR select id name machineAssignments machineId isPrimary, machines findMany id name, executionMachines findMany where operatorId in ids machineId not null orderBy startTime desc select operatorId machineId startTime → machinesByOperator map push unique, activeJobCount count productionExecution where endTime null status not VOIDED.
- Page maps employees to machineIds from assignments or fallback machinesByOperator get plus machineNames [].
- KioskHub: state operatorId from sessionStorage kiosk_operator_id initial hydration isInitialized false shows spinner. If !operatorId render KioskOperatorGate employees machines onSelect handleOperatorSelect sets operatorId sessionStorage. Gate shows list operators searchable.
- If operatorId: find currentEmployee, machineNames from machineIds map to names filter.
- Chip bar bg-emerald-500/5 border-2 emerald-500/20 shadow-sm: KioskOperatorChip name machineNames + Button Destructive Logout Sesi LogOut icon kioskLabels.sessionLogout Keluar.
- Title hubTitle uppercase tracking tighter + hubSubtitle muted.
- Grid 2 cols Tiles:
  - Produksi/SPK Link /kiosk/jobs group border-2 rounded-2xl p-6-8 hover border-primary shadow-lg active scale 0.98 emerald icon ClipboardList badge if activeJobCount>0 bg-emerald-600 text-xs "aktif" absolute top-4 right-4.
  - Absensi Link /kiosk/attendance blue icon UserCheck tileAbsensi desc.
  - Proses Khusus if hasProsesKhusus (default true): purple Wrench icon tileProsesKhusus desc HD Potong-Plong + 2 links HD /kiosk/production/hd and PotongPlong /kiosk/production/potongplong each flex-1 h-11 rounded-lg border-2 bg-purple-50 border-purple-200 text-purple-700 hover purple-100.
  - Status Saya Link /my amber LayoutDashboard icon tileStatusSaya desc.
- MyPortalQr component.

## Kiosk Job List (KioskJobList.tsx)

- Props initialOrders (id orderNumber plannedQuantity actualQuantity status bom productVariant name skuCode primaryUnit salesUnit conversionFactor machine id name executions startTime endTime outputLogs etc), employees machineIds, machines operatorIds maybe.
- State timeLeft 30 selectedOperatorId from sessionStorage, selectedMachineId ALL defaultMachineId logic: if operator has single machineIds assignment length 1 → that machine else ALL. useBarcodeScanner hook toast Scan code set query param q? searchParams.
- Timer interval 1s decrement timeLeft reset 30, when 0 router.refresh transition.
- clearFilter deletes q param.
- searchQuery searchParams.get q, hasFilter has q.
- operatorMachineIds from employees find selectedOperatorId machineIds.
- getFilteredOrders: if operatorMachineIds>0 filter order.machine && includes, if selectedMachineId != ALL filter machine id.
- availableMachines filtered by operatorMachineIds or all.
- If !isInitialized spinner. If !selectedOperatorId center "Belum ada operator yang dipilih. Kembali ke Hub" button ArrowLeft.
- Header bg-card p-4-6 rounded-xl border-2 shadow-sm: back ArrowLeft icon to /kiosk title jobList uppercase selectJob subtitle, right Filter chip if searchQuery FILTER: xxx primary/10 border primary/20, Refresh form action refreshKioskData button secondary size lg h-12-14 "SEGARKAN" uppercase font bold border-2 active scale 95 RefreshCcw icon.
- Timer bar h-2 w-full bg-muted rounded-full border shadow-inner inner div h-full bg-primary transition duration 1000 ease-linear width timeLeft/30*100%.
- Operator info bar emerald 5% border-2: left avatar circle emerald-600 text-white font-bold initial name char uppercase, sessionActive label uppercase tracking widest 10px muted, name uppercase tracking tight xl bold, machineNames join comma emerald-600 small. Right Filter Mesin select h-12 rounded-lg border-2 bg-card px-4 font-bold text-sm appearance none options -- SEMUA MESIN -- + availableMachines.
- hasFilter show Hapus Filter button outline h-10 border-2 Search icon.
- Operator no machine assignment warning amber-50 border-2 amber 200 text amber-800 dark amber-950 "Tidak ada Penugasan Mesin Anda belum ditugaskan ke mesin tertentu. Hubungi supervisor."
- Jobs grid 1-2-3 cols gap-6 pb-24: if filteredOrders 0 check hasFilter -> emptyNoFilterMatch + searchQuery + ClearFilter link else if operatorMachineIds>0 -> emptyNoJobsForMachine uppercase + emptyWaitingRelease "Menunggu rilis SPK dari kantor perencanaan." else emptyNoJobsReady uppercase + emptyWaitingRelease. Else map KioskOrderCard order operatorId.

## Kiosk Job Focus (KioskJobFocus.tsx)

- Order type similar but includes plannedEnteredQuantity etc helpers name, status, bom, machine, executions, outputLogs createdAt quantity, helpers.
- State isLoading stopDialogOpen logDialogOpen operatorId from sessionStorage, isInitialized timeLeft 30 optimisticExecutionId, useTransition.
- activeExecution find executions !endTime or optimistic fallback new Date id.
- isRunning !!activeExecution.
- unitMeta via getProductionUnitMeta productVariant (primaryUnit salesUnit conversionFactor displayUnit).
- Gate redirect to /kiosk if no operator after initialized.
- Clear optimistic when real execution lands.
- Timer pause when dialogOpen log/stop.
- handleStart: startExecution productionOrderId machineId operatorId → toast Operator diganti! or Produksi dimulai! set optimistic id refresh.
- recentLogs outputLogs slice 0 3.
- Progress numbers: actualBase actualQuantity||0 targetBase plannedQuantity, progressActual = hasAlternate? toDisplayQuantity(actualBase factor) : actualBase, same target displayUnit.
- If !initialized or !operatorId spinner.
- UI: timer bar h-1.5, back nav ArrowLeft to /kiosk/jobs title WO# orderNumber mono badge RUNNING emerald animate-pulse uppercase or getStatusLabel production status.
- Job info card border-2 rounded-2xl p-6-8 if running border emerald shadow-lg else border-border: h1 productVariant name 2xl-3xl font-black, meta machine name operator Anda, KioskJobProgress actual target unit displayUnit.
- CTA: if running: Button full h-16 text-lg/xl font-black bg-emerald-600 hover emerald-700 PlusCircle logOutput uppercase CATAT HASIL + grid 2 cols DowntimeDialog machineId machineName operatorId trigger Button outline h-14 font-bold border-2 Downtime label focusDowntime + Stop button destructive h-14 Square icon focusStop. Else: Start button Play icon startJob uppercase MULAI SPK disabled if COMPLETED.
- Recent logs if >0 bg-muted/30 border rounded-xl p-4 title focusLogTerakhir uppercase tracking wider muted, each log flex qty toLocaleString id-ID primaryUnit + time toLocaleTimeString id-ID hour 2 digit minute.
- Dialogs: if activeExecution KioskStopDialog open onOpenChange executionId productName primaryUnit salesUnit conversionFactor currentProduced targetQuantity logs operatorId onSuccess refresh + KioskLogOutputDialog executionId productName etc orderHelpers (helpers) etc. These dialogs have wizard steps: wizardStepQty Qty Bagus wizardQtyDesc, wizardStepScrap Scrap wizardScrapDesc Prongkol & Daun atau lewati, wizardStepFoto Bukti Foto wizardFotoDesc, wizardStepKonfirmasi Konfirmasi wizardKonfirmasiDesc, buttons Lanjut/Kembali/Kirim Hasil/ Lewati — Tanpa Scrap etc. Focus catat hasil focusCatatHasil etc.

## Kondisi SPK Muncul
- SPK harus RELEASED Siap Produksi or IN_PROGRESS. DRAFT/WAITING_MATERIAL tidak muncul.
- Operator machineIds match machine id or fallback from executionMachines.

## Proses Khusus
- HD: /kiosk/production/hd HdProductionForm 39 symbols, Potong/Plong: PotongPlong page + form 38 symbols. These are special flows with own fields.

## Troubleshooting
- Kiosk tidak bisa diakses cek jaringan tablet, /kiosk hub spinner 60vh.
- SPK tidak muncul cek status rilis & mesin assignment.
- Session hilang login ulang gate clear sessionStorage.
- Foto gagal cek compressImageForUpload + R2.
- Timer auto-refresh 30s bar.
`,
modules: ['production'], tags: ['kiosk','operator','catat-hasil','SPK'], errorCodes: [], source: 'SEED' as HelpArticleSource,
},
{
slug: 'error-backflush-atau-stok-bahan',
title: 'Error Backflush / Stok Bahan Baku Kurang',
summary: 'Backflush consume otomatis saat catat output, cek Materials tab Rencana vs Keluar Selisih, atasi via penerimaan transfer penyesuaian atau PR.',
bodyMd: `## Kapan Terjadi?
Saat mencatat hasil produksi, sistem otomatis mengonsumsi bahan baku (backflush). Jika stok bahan kurang, muncul error.

## Menu Terkait
- **SPK Detail**: Produksi → SPK → detail → tab Materials
- **Stok**: Stok → Stok
- **Transfer**: Stok → Transfer Stok
- **Penyesuaian**: Stok → Penyesuaian Stok

## Solusi

1. **Cek kebutuhan bahan** di tab Materials SPK. Lihat kolom Rencana vs Keluar dan Selisih.
2. **Top up stok** via:
   - Terima barang: Stok → Penerimaan Barang
   - Transfer dari gudang lain: Stok → Transfer Stok
   - Penyesuaian cepat: Stok → Penyesuaian Stok (jika data tidak sinkron dengan fisik)
3. **Catat hasil lagi** setelah stok tersedia. Backflush otomatis retry.
4. **Buat Permintaan Pembelian** jika butuh beli bahan: klik tombol di tab Materials.

## Tips
- Cek preview bahan sebelum Rilis SPK.
- Atur Minimum Stok Alert di Katalog Produk untuk bahan kritis.

### Catatan Teknis

Penyebab Real

- BOM butuh X Y unit, stok di source lokasi < Y saat backflush. Backflush categories: MIXING EXTRUSION PACKING REWORK (isBackflushCategory). actualQuantity / plannedQuantity * required = backflushedQty if no explicit issues.
- Dual-path materialPath resolveMaterialPath(category): floor_wip vs gudang. Floor WIP staging lantai (Path B) vs Gudang (Path A) Raw Material prioritas gudang. Jika mixing need RM → must issue from Gudang before Release.
- Substitute materials allowed: materialIssues not in plannedMaterials grouped sum yellow bg "Diluar rencana" badge Pengganti.

## Detail Materials Tab (OrderMaterialsTab.tsx)

- Props order ExtendedProductionOrder formData locations rawMaterials. plannedQty Number, category bom.category, materialPath, isActive IN_PROGRESS RELEASED WAITING_MATERIAL, isFloorPath floor_wip, isWaitingMaterial.
- ChildOrderList for sub-orders.
- If isWaitingMaterial amber border Package icon "SPK menunggu bahan — cek kebutuhan di bawah. Path A (Mixing): pengambilan bahan baku di Gudang. Hubungi Gudang untuk issue bahan sebelum Rilis." Button Buka Gudang /warehouse external.
- If isActive && !waiting: info card muted/40 Info icon "Jalur bahan: Staging lantai (Path B) WIP hasil mixing dapat di-staging di lantai. Ambil dari lantai saat produksi Extrusion/Packing. Bahan tambahan (mis. pelembab) hanya via Gudang." vs "Jalur bahan: Gudang (Path A) Issue bahan baku dilakukan di Gudang..." Button Buka Gudang untuk bahan baku /warehouse.
- Buttons header Kebutuhan Bahan: ManualProcurementDialog (create Purchase Request for shortage) + if isActive && isFloorPath BatchIssueMaterialDialog (Transfer Material to Staging).
- Table Kebutuhan Bahan: thead Bahan Rencana (text-right) Keluar Selisih. Body plannedMaterials map item productVariant name badge Rencana blue uppercase tracking wider sku, required fixed 2 primaryUnit muted, issued = manualIssued (materialIssues filter productVariantId status != VOIDED sum quantity) + backflushedQty (if !hasExplicitIssues && isBackflushCategory && actualQty>0 && plannedQty>0). variance issued-required variancePercent, color emerald-500/red-500/amber-500 progress bar width min(100, issued/required*100%). Variance badge font mono red if over, emerald if 0, amber if under with +/- value and percent. Progress color logic variancePercent>5 red <-5 amber else emerald.
- Substitute rows: materialIssues filter status != VOIDED && not in plannedMaterials grouped by productVariantId sum quantity items yellow bg 10% hover 20% dark 15%/25% cols product name "Diluar rencana" amber uppercase bold, - in Rencana, quantity amber bold primaryUnit, badge Pengganti amber outline.
- Section Riwayat Pengeluaran h3 + if 0 italic "Belum ada bahan yang dikeluarkan." else grid materialIssues map issue id productVariant name issuedAt format d MMM yyyy HH:mm id locale status VOIDED badge Void line-through opacity 50 muted bg, quantity mono bg-muted px-2 py-1 rounded.

## Cek Stok

- Stok → Stok /warehouse/inventory cek current stock Terpesan Tersedia.
- Stok Lantai Produksi → Stok Lantai /production/inventory if WIP.

## Solusi

Opsi1 Top up RM via Gudang:

- Stok → Penerimaan Barang /warehouse/incoming terima dari PO, or Pembelian → Order Pembelian /purchasing/orders buat PO.
- Transfer: Stok → Transfer Stok /warehouse/inventory/transfer sourceLocation destinationLocation quantity confirmTransfer. Hindari asal=tujuan.
- Setelah stok masuk, catat hasil lagi backflush retry otomatis next execution, no explicit Retry Backflush button (seed lama salah).

Opsi2 Penyesuaian cepat jika fisik ada data tidak sinkron:

- Stok → Penyesuaian Stok /warehouse/inventory/adjustment label Penyesuaian Stok desc "Sesuaikan jumlah stok... " selectProduct selectLocation adjustmentType addition/reduction reasonPlaceholder "contoh: Rusak, Expired, Ditemukan" quantity confirmAdjustment. Bulk adjust Bulk Adjust etc. quickStockAdjustment label "Penyesuaian Stok Cepat".
- After adjustment, ulang catat hasil.

Opsi3 Cek/Edit BOM hati-hati:

- BOM di Katalog Produk → BOM/Formula /dashboard/boms or Produksi → BOM/Formula /production/boms alias (PORTAL_ALIASES production boms canonical /dashboard/boms). Don't edit saat backflush error unless recipe wrong unit/conversion.
- Substitute via Transfer Material to Staging BatchIssueMaterialDialog: useGlobalSource Ikuti lokasi sumber di atas, enablePerItemSource Sumber beda per material, sourcePerItem Asal stok, toDestination Ke, defaultLocation, overrideSourceLocation Ganti Lokasi Sumber, outputLocation Lokasi Output (Tujuan FG/WIP) help "Lokasi stok hasil / staging WO. Bukan gudang bahan baku.", stock, fixShortage Atasi Kekurangan, quickStockAdjustment Penyesuaian Stok Cepat, refreshStock Segarkan Stok, editingRowsWarning "Mengedit baris akan memperbarui Rencana Pesanan secara permanen." etc. Select substitute "Pilih pengganti...".

Opsi4 PR:

- ManualProcurementDialog in materials tab: procureMaterials Pengadaan Material selectMaterialsDescription, qtyToProcure, priority Normal/Urangent, additionalNotes, purchaseRequestInfo "Ini akan membuat Permintaan Pembelian baru untuk tim Pembelian. Tidak akan membuat Pesanan Pembelian langsung.", createPurchaseRequest. Use for shortage.

## Ad-hoc Material Gudang RM

- Stok → Bahan Produksi /warehouse/materials → Catat Pemakaian Bahan ad-hoc (recordAdHocUsage) help "Untuk bahan dari gudang RM (mis. pelembab). Stok langsung berkurang & masuk HPP WO. Idealnya dicatat oleh gudang di modul Warehouse." AdHocMaterial selectAdHocMaterial, reason placeholder "contoh: pelembab tambahan saat produksi", recording Mencatat..., nonPlanBlockedInExtrusi message. Don't transfer staging like Mixing HD.

## Pencegahan

- Cek preview materialPreviewPanel before rilis currentStock.
- Atur Minimum Stock Alert bahan kritis /dashboard/products.
- Use Bulk Transfer/Adjust for multi bahan.

## Error Label
- No explicit Retry Backflush button — next Add Output execution triggers consume.
`,
modules: ['production','warehouse'], tags: ['backflush','material-shortage','BOM'], errorCodes: ['MATERIAL_INSUFFICIENT','BACKFLUSH_FAILED'], source: 'SEED' as HelpArticleSource,
},
{
slug: 'cara-lihat-invoice-belum-lunas',
title: 'Cara Melihat Invoice yang Belum Lunas',
summary: 'Piutang di Penjualan Invoice & Piutang / Finance Invoice Sales dengan filter status Belum Dibayar Partial Lewat Jatuh Tempo, tab Legacy Internal, outlier overdue, dan delete invoice & jurnal.',
bodyMd: `## Menu Terkait
- **Invoice Sales**: Penjualan → Invoice & Piutang atau Finance → Invoice Sales
- **Terima Bayar**: Finance → Terima Bayar

## Langkah Cek Invoice Belum Lunas

1. Buka **Penjualan → Invoice & Piutang** atau **Finance → Invoice Sales**.
2. Lihat kartu **Belum Dibayar** dan **Lewat Tempo** di atas.
3. Filter status: **Belum Dibayar**, **Dibayar Sebagian**, atau **Lewat Jatuh Tempo**.
4. Klik invoice untuk lihat detail dan catat pembayaran.

### Catatan Teknis

Menu Sales: Penjualan → Invoice & Piutang /sales/invoices title Invoice Penjualan desc Kelola invoice dan lacak pembayaran + cards Jumlah Belum Dibayar (outstandingAmount) "Invoice belum lunas atau sebagian" (unpaidPartial) + Invoice Lewat Tempo (overdueInvoices) "Perlu perhatian segera" (requiresImmediateAttention) + Semua Invoice (allInvoices) "Daftar semua invoice penjualan yang dibuat."
Menu Finance: Finance → Invoice Sales /finance/invoices/sales title Invoice Sales subtitle Kelola tagihan customer dan lacak pembayaran tertunggak. Tabs Customer AR vs Legacy Internal (demand customer|legacy-internal) TabsList grid 2 md w-420px Customer AR link buildDemandHref customer, Legacy Internal link legacy-internal. Legacy alert amber border "Legacy internal review This tab is for historical invoices that originated from internal stock build flows before customer enforcement was added. Treat it as cleanup and audit review, not as a normal receivables workflow."
Finance juga: Invoice Purchase /finance/invoices/purchase, etc.
Payment: Finance → Terima Bayar /finance/payments/received (ReceivedPaymentsClient) & Bayar Supplier /sent.

## InvoiceTable Component (InvoiceTable.tsx)

- Props invoices array id invoiceNumber invoiceDate dueDate totalAmount paidAmount status InvoiceStatus salesOrderId purchaseOrderId salesOrder orderNumber customer name purchaseOrder orderNumber supplier name + basePath initialStatus overdueMode.
- State isDeleting, searchTerm, statusFilter initialStatus or urlStatus or ALL, isOverdueMode overdueMode or urlOverdue ?overdue=true.
- useEffect sync statusFilter from initialStatus/urlStatus.
- filteredInvoices useMemo: now new Date(), if isOverdueMode filter dueDate < now + remaining = total-paid >0 + overdueStatuses IN UNPAID PARTIAL OVERDUE else if statusFilter != ALL status != filter false. Then search lowSearch entityName salesOrder customer name or purchaseOrder supplier name or Legacy Internal Stock Build invoiceNum lower orderRef salesOrder orderNumber etc includes.
- handleDelete deleteInvoice id type AR/AP → toast Invoice berhasil dihapus else error.
- getStatusBadge styles UNPAID slate, PAID emerald, PARTIAL amber, OVERDUE red border red 200, CANCELLED red 50 etc Badge variant secondary getStatusLabel finance.
- columns useMemo: invoiceNumber header No. Invoice, invoiceDate header date sorting datetime cell format PP, dueDate header Jatuh Tempo sorting accessor dueDate getTime cell red bold if OVERDUE, entity header Entitas accessor customer/supplier, orderReference header Order Referensi link basePath includes finance ? invoice.id : salesOrderId/purchaseOrderId/id link, status header status cell badge, totalAmount header Total right cell formatRupiah, actions header Aksi cell flex gap Button ghost ArrowRight link detail + AlertDialog Delete/Void Button Trash2 Loader2 when deleting disabled isDeleting==id class destructive, Dialog content "Apakah Anda benar-benar yakin? Tindakan ini akan menghapus invoice secara permanen **invoiceNumber** beserta jurnal akuntansinya dari buku besar. Tindakan ini tidak dapat dibatalkan." Buttons Batal vs Hapus Invoice & Jurnal bg-destructive.
- getStatusBadgeStyle duplicate.
- getEntityName.
- renderMobileView: if 0 emptyInvoices text dashed. Else Card per invoice clickable router push basePath/linkId, CardHeader p-4 pb-2 Receipt icon primary/10, invoiceNumber bold, invoiceDate MMM d yyyy, Badge small 10px status, CardContent Entitas truncate Total primary, Jatuh tempo MMM d yyyy + Lihat Detail ChevronRight.
- Return DataTable columns data filteredInvoices emptyMessage All notifications minWidth 900 renderMobileView + Children toolbar flex search relative Search icon left Input placeholder "Cari invoice, order, atau entitas..." value searchTerm + Select statusFilter onValueChange value ALL DRAFT UNPAID etc labels Semua Status Draft Belum Dibayar Dibayar Sebagian Lunas Lewat Jatuh Tempo Dibatalkan.

## Page Finance Invoices Sales (page.tsx)

- Query searchParams startDate endDate demand customer|legacy-internal default customer initialStatus status. Only filter by date when explicitly provided parseISO else undefined. buildDemandHref preserves startDate endDate status.
- getInvoices dateRange demand → serializedInvoices serializeData.
- Header flex title Invoice Sales subtitle, ContextualHelp title Panduan Invoice prefill "Kenapa error period locked saat posting invoice?" links Cara Lihat Invoice Belum Lunas + Error Period Locked, UrlTransactionDateFilter defaultPreset all align end.
- Tabs defaultValue demand Customer AR / Legacy Internal. If legacy alert amber title legacy internal review desc. Then InvoiceTable invoices serialized basePath /finance/invoices/sales initialStatus.

## Tindakan Payment

- Catat pembayaran bukan Record Payment generic detail invoice. Real: Finance → Terima Bayar /finance/payments/received (ReceivedPaymentsClient) or Invoice & Piutang action terima bayar. Form invoice date method amount.
- After payment status PARTIAL PAID Sisa Tagihan = Total - Paid (remainingAmount).
- Export via actionLabels export.

## Yang Tidak Ada
- Send Reminder generic seed lama no.
- After SHIPPED auto draft invoice maybe via updateDeliveryStatus creating invoice? Check auto journal.

## Tips
- Cek overdue mode ?overdue=true or board filter: dueDate < now remaining>0 UNPAID PARTIAL OVERDUE.
- Pipeline Potensi Omzet at Sales Orders page links.
- Legacy internal cleanup not normal receivables.
`,
modules: ['finance','sales'], tags: ['invoice','piutang','overdue'], errorCodes: [], source: 'SEED' as HelpArticleSource,
},
{
slug: 'error-period-locked-finance',
title: 'Error Period Locked di Finance',
summary: 'Periode fiskal di Finance Periode Fiskal dengan Buat Periode, Tutup dengan jurnal penutupan ke Laba Tahun Berjalan 33000, dan Buka Kembali.',
bodyMd: `## Kapan Terjadi?
Saat posting invoice, payment, atau jurnal di periode yang sudah ditutup admin.

## Menu Terkait
- **Periode Fiskal**: Finance → Periode Fiskal

## Solusi

1. **Gunakan periode yang masih OPEN** — ubah tanggal transaksi ke periode terbuka.
2. **Minta admin buka kembali** — admin klik **Buka Kembali** di Finance → Periode Fiskal. Setelah transaksi diproses, Tutup lagi.

## Pencegahan
- Catat transaksi tepat waktu, jangan menumpuk akhir periode.
- Sebelum tutup buku, pastikan semua invoice/payment/journal sudah diposting.

### Catatan Teknis

Menu: Finance → Periode Fiskal /finance/periods?year=
Error: PERIOD_LOCKED, POSTING_PERIOD_CLOSED

Penyebab
- Transaksi invoice/payment/journal di periode CLOSED terkunci admin.
- Admin tutup buku via Tutup.

## Page & Components

Finance periods page.tsx:
- searchParams year string default currentYear new Date getFullYear. selectedYear parseInt or current. getFiscalPeriods selectedYear → initialPeriods.
- Component PeriodManagementClient initialPeriods currentYear.

PeriodManagementClient.tsx:
- Props initialPeriods FiscalPeriod[] currentYear number.
- State year currentYear string, isPending via useTransition, router, isConfirmOpen, selectedPeriod id name, closingSummary totalRevenue totalOpEx netIncome.
- useEffect sync year from currentYear prop.
- handleYearChange newYear setYear + startTransition router push /finance/periods?year=newYear. isYearTransitioning = isPending && year != currentYear.
- handleGenerate startTransition generatePeriodsForYear parseInt year → toast Periode untuk tahun {year} berhasil digenerate. refresh else error.
- handleCloseClick id name setSelectedPeriod + getIncomeStatementSummary id → if fail toast else setClosingSummary + setIsConfirmOpen true.
- handleConfirmClose if selectedPeriod startTransition closePeriod id → toast Periode fiskal {name} berhasil ditutup dengan jurnal penutup. setIsConfirmOpen false refresh else error msg.
- handleStatusChange if OPEN return else reopenPeriod id → toast Periode fiskal berhasil dibuka kembali. refresh.
- UI:
  - Flex header title Periode Fiskal subtitle Kelola periode akuntansi dan proses penutupan. Right Select year value year onValueChange handleYearChange disabled isPending Trigger w-120px shows Loader2 if transitioning else Value placeholder Tahun. Options 2024 2025 2026 2027.
  - Card overflow hidden if isYearTransitioning overlay absolute inset bg-background/50 backdrop-blur 1px loader centered.
  - CardHeader title flex justify between Periode Tahun {year} + if initialPeriods length 0 or transitioning Button onClick handleGenerate disabled isPending shows Loader2 if pending && !transitioning else CalendarPlus icon Buat Periode.
  - CardContent Table thead Nama Periode Tanggal Mulai Tanggal Selesai Status Aksi. Body if 0 and not transitioning row colSpan 5 text-center h-24 muted "Tidak ada periode untuk {year}. Klik generate untuk memulai." else map initialPeriods TableRow: name font-medium, startDate format dd MMM yyyy, endDate same, status Badge variant default if OPEN else secondary text status, Aksi Button ghost sm onClick period OPEN ? handleCloseClick else handleStatusChange disabled isPending: if OPEN Lock icon Tutup else LockOpen Buka Kembali.
  - AlertDialog open isConfirmOpen: Content max-w-md Title "Tutup Periode Fiskal: {selectedPeriod.name}" Description "Menutup periode ini akan otomatis membuat jurnal penutupan untuk mereset akun Revenue dan Expense. Tindakan ini penting untuk menjaga integritas keuangan." If closingSummary py-4 space-y-3 div flex justify between Total Pendapatan font-semibold formatRupiah totalRevenue, Total Beban destructive formatRupiah totalOpEx, Separator, Estimasi Laba Bersih base font-bold netIncome primary if >=0 else destructive formatRupiah, italic 10px "* Laba bersih akan dipindahkan ke Laba Tahun Berjalan (33000)." Footer Cancel Batal disabled isPending + Action Konfirmasi & Generate Entri bg-primary hover 90 disabled isPending loader.

PeriodFormDialog.tsx:
- Button outline CalendarPlus Open New Period trigger.
- DialogContent sm max 425px form onSubmit handleSubmit prevents default loading true → createFiscalPeriod year month → toast success Periode fiskal berhasil dibuat. setOpen false else error.
- State year currentYear string month currentMonth string.
- Form: DialogHeader title Open Fiscal Period description Select the month and year to open for accounting entries. Grid Year label Select value year onValueChange setYear Trigger col-span-3 Value Year options currentYear-1 currentYear currentYear+1. Month label Select value month onValueChange Trigger Value Month options 1-12 locale long month. Footer Cancel Cancel button + Submit Open Period disabled loading Creating...

## Solusi

Opsi1: Gunakan periode OPEN ubah tanggal transaksi.

Opsi2: Admin klik Buka Kembali untuk buka sementara, setelah transaksi diproses Tutup lagi (akan generate jurnal penutupan). Audit log.

## Pencegahan
- Catat tepat waktu jangan menumpuk akhir periode.
- Sebelum tutup buku pastikan semua invoice/payment/journal posting.
- Period Lock cegah ubah data audit — darurat saja.

## Catatan
- Path lama Accounting→Period Locks salah, real Finance→Periode Fiskal (fiscalPeriods).
- Closing generates closing journal to 33000 Laba Tahun Berjalan.
- Year filter via query ?year=.
`,
modules: ['finance'], tags: ['period-locked','periode-fiskal','tutup-buku'], errorCodes: ['PERIOD_LOCKED','POSTING_PERIOD_CLOSED'], source: 'SEED' as HelpArticleSource,
},
{
slug: 'cara-atur-role-permission-user',
title: 'Cara Atur Role & Permission User',
summary: 'Role permission diatur di Pengaturan ?tab=users access dengan tree auto-save, hint relogin, dan Lihat Harga toggle.',
bodyMd: `## Menu Terkait
- **Pengaturan**: Pengaturan (sidebar)
- **Kontrol Akses**: Pengaturan → tab Kontrol Akses
- **Pengguna**: Pengaturan → tab Pengguna

## Langkah Atur Permission

1. Buka **Pengaturan** → tab **Kontrol Akses**.
2. Klik **Buka Semua** untuk melihat semua modul.. Centang modul yang ingin diizinkan untuk role. Centang modul root = akses penuh.
4. Perubahan tersimpan otomatis (tidak perlu tombol Simpan).
5. Minta user login ulang agar akses baru aktif.

## Langkah Assign Role ke User

1. Buka **Pengaturan** → tab **Pengguna**.
2. Klik user yang ingin diubah.
3. Atur role (bisa multi-role).
4. Simpan. User mungkin perlu login ulang.

### Catatan Teknis

Menu: Pengaturan /dashboard/settings?tab=general|company|notifications|users|access|system Panduan Pengaturan prefill "Cara atur role dan permission user di Polyflow?" links Cara Atur Role & Menu Tidak Muncul
Tombol/hint: Izin disimpan toast permissionSaved, Gagal memperbarui izin permissionSaveFailed, Perubahan tersimpan otomatis saat Anda mencentang. Tidak perlu tombol Simpan. permissionAutoSaveHint, Pengguna yang sudah login mungkin perlu login ulang agar menu/akses modul baru aktif penuh di sesi mereka. permissionReloginHint, Centang modul root = beri akses penuh... parent indeterminate permissionTreeHint, Buka Semua expandAll Tutup Semua collapseAll, Lihat Harga viewPrices desc Dapat melihat harga produk dan nilai inventaris viewPricesDesc, Modul ModuL FeaturePermissions etc settingsLabels.

## Settings Page (page.tsx)

- auth via auth() + headers tenant subdomain extraction. userRole session.user.role default WAREHOUSE, userRoles roles array, currentUserId, name email, fetch prisma.user locale avatarUrl if id.
- Render div p-4 md:p-6 max-w-7xl mx-auto header Pengaturan title + ContextualHelp links. SettingsTabs props currentUserRole etc appVersion package.json.version environment NODE_ENV.

## SettingsTabs.tsx

- Role isTenantAdmin check from role & roles.
- Props currentUserRole currentUserRoles currentUserId tenantName currentUserName etc appVersion environment.
- activeTab from searchParams get tab as TabValue default general. setActiveTab pushes ?tab=...
- tabs array: general label settingsLabels.general icon User desc generalDesc Kelola profil dan preferensi Anda, notifications Bell notificationsDesc Kelola preferensi notifikasi in-app, if isAdmin add company Building2 companyDesc Info perusahaan untuk dokumen cetak, users Users usersDesc Kelola pengguna sistem dan role, access Lock accessControlDesc Konfigurasi izin untuk setiap role, system Monitor systemDesc Lihat kesehatan sistem dan versi.
- renderContent switch: general → GeneralSettings tenantName userName email locale avatarUrl, notifications → NotificationSettings, company → CompanySettings if admin, users → UsersTab currentUserId if admin, access → AccessControlTab if admin, system → Card max-w-2xl header SettingsIcon systemInfo erpVersion v{appVersion} environment capitalize serverStatus Online green.
- Nav overflow-x-auto gap-1 border-b mb-6 tablist aria-label Settings sections buttons role tab aria-selected aria-current page onClick setActiveTab class border-b-2 primary if active else muted hover.
- Content min-w-0 renderContent.

## Konsep Permission

- Role = kumpulan resource path (master sales production warehouse purchasing finance hrd maklon etc) definisi di permission-catalog etc.
- Permission = path string like /sales/orders /warehouse/inventory /production/orders etc resource tree, bukan 5 fixed roles.
- Satu user multi role.
- ViewPrices toggle terpisah.

## Access Tab Real

- Tree permission Module > Feature > sub-feature with checkbox.
- Buka Semua / Tutup Semua buttons.
- Parent indeterminate (–) when partial children checked.
- Changes auto-save immediately no Save button. Toast Izin disimpan after success fail Gagal memperbarui izin.
- Hint relogin displayed maybe below tree.
- Feature Permissions description featurePermissionsDesc.

## Assign Role

- Tab Users (UsersTab) list users, click user edit roles (multi roles array).
- Save user. If self check General tab = profil.
- After role change target user might need relogin.

## Tips
- Jangan Admin semua orang.
- Jika user bilang menu tidak muncul cek Kontrol Akses path existing.
- Review quarterly.
- Menu EN generic lama salah.

## Path benar
- Old SEED: Settings → Users / Access Control → Roles tab → + Role Baru → Simpan (wrong). Real /dashboard/settings?tab=access tree auto-save.
`,
modules: ['access'], tags: ['role','permission','pengaturan'], errorCodes: [], source: 'SEED' as HelpArticleSource,
},
{
slug: 'menu-tidak-muncul-permission',
title: 'Menu Tidak Muncul? Cek Permission',
summary: 'Menu hilang karena permission resource path di Kontrol Akses ?tab=access, auto-save, dan butuh relogin plus desktop-only.',
bodyMd: `## Penyebab Menu Tidak Muncul

1. Role tidak punya akses ke menu tersebut.
2. User belum login ulang setelah perubahan permission.
3. Menu hanya tersedia di desktop (bukan mobile).

## Cara Cek Sendiri

1. Buka **Pengaturan** → tab **Kontrol Akses**.
2. Klik **Buka Semua**.
3. Cari menu yang hilang, pastikan sudah dicentang.

## Minta Admin Cek

1. Admin buka **Pengaturan** → tab **Pengguna** → cek role user.
2. **Kontrol Akses** → centang path yang kurang. Tersimpan otomatis.
3. Minta user login ulang.

### Catatan Teknis

Menu: Bantuan /support + Pengaturan /dashboard/settings?tab=... Cara Pakai /support filter ?module= Troubleshooting /support/troubleshooting Tanya Virtual CS /support/cs
Error: PERMISSION_DENIED ACCESS_DENIED
Path settings: /dashboard/settings?tab=general umum, ?tab=users pengguna, ?tab=access kontrol akses, ?tab=system sistem
Hint: Izin disimpan, Perubahan tersimpan otomatis, Buka Semua Tutup Semua

## Penyebab Real
1. Role tidak punya permission resource path for menu.
2. User not assigned correct role.
3. Desktop-only feature: some menus only desktop (BOM editing, Accounting detail, Costing, etc) not available in /sales/mobile mode.

## Cek Sendiri

- Open Pengaturan /dashboard/settings?tab=general (requires permission if not visible you are non-admin). Lihat profil Umum.
- If admin: tab Pengguna ?tab=users search name role active. Then tab Kontrol Akses ?tab=access expand tree Buka Semua check centang for path missing (e.g. /sales/orders, /warehouse/inventory, /production/orders).
- Toast Izin disimpan after check.
- Access tab shows Module Feature etc plus viewPrices toggle.

## Minta Admin Cek

- Admin open Pengaturan → Pengguna → name cek role.
- Kontrol Akses → find missing menu tree path → centang auto-save.
- Minta relogin.

## Solusi

- No permission → admin centang Kontrol Akses + toast + relogin.
- Role salah → assign correct role tab Users.
- Mobile → some menus only desktop, open Polyflow desktop browser not /sales/mobile.
- Lihat Harga toggle if user sees stock but not price check viewPrices in Access.

## Beda Seed Lama

- My Profile → Roles & Permissions vs real Pengaturan → Umum profile, Users list, Kontrol Akses tree.
- Role template table 5 fixed generic vs real path-based resource.
- Support → Bantuan label ID.
- ContextualHelp in pages links to these articles via ? support slug.

## Tips Admin
- Don't granular too much hard manage but don't full Admin all.
- Use Buka Semua/Tutup Semua review.
- ViewPrices separate.
`,
modules: ['access'], tags: ['menu-tidak-muncul','permission','troubleshoot'], errorCodes: ['PERMISSION_DENIED','ACCESS_DENIED'], source: 'SEED' as HelpArticleSource,
},
{
slug: 'apa-yang-bisa-virtual-cs',
title: 'Apa yang Bisa & Tidak Bisa Virtual CS?',
summary: 'Virtual CS di /support/cs dengan chips cepat, grounded citation artikel, copy thumbs, read-only guardrail.',
bodyMd: `## Lokasi
- **Bantuan → Tanya Virtual CS** di sidebar.
- Atau langsung buka `/support/cs`.

## Yang Bisa Dilakukan Virtual CS

1. **Cek stok** — "Cek stok MP 15 di Gudang A"
2. **Cek SO aktif** — "SO yang belum dikirim"
3. **Cek SPK aktif** — "SPK yang sedang berjalan"
4. **Cek piutang** — "Invoice belum lunas"
5. **Panduan cara pakai** — "Cara buat Sales Order" (grounded dari artikel)

## Yang Tidak Bisa

- Mengubah data (buat/edit/hapus SO, SPK, stok, invoice)
- Mengakses data sensitif (password, data cross-tenant)

## Cara Tanya yang Bagus

- Spesifik: "Cek stok MP 15 di Gudang A"
- Sebut nomor: "Status SO-2026-0001"
- Sebut menu: "Cara buat SO di Penjualan → Sales Order"

### Catatan Teknis

Detail UI

- Support layout: auth redirect /login, getMyPermissions + sessionAllowed fallback /support, SidebarNav + SidebarSpacer main.
- Howto page: searchParams module tab legacy redirect ?tab=cs → /support/cs?q= and ?tab=troubleshoot → /support/troubleshooting?module=. moduleFilter ?module=, listPublishedArticles module limit 30, render SupportPageHeader title Cara Pakai subtitle Panduan langkah demi langkah penggunaan Polyflow per modul. + SupportModuleChips module basePath /support + ArticleGrid or EmptyState howto.
- CS page: searchParams tab howto→/support troubleshoot→/troubleshooting, q param slice 500 initialQuestion. Header breadcrumb Bantuan › Tanya Virtual CS, h1 Tanya Virtual CS desc "Tanya cara pakai atau cek data operasional — jawaban grounded pakai artikel bila ada." Then PolyflowChatPanel embedded initialQuestion q.
- ChatPanel: state question initialQuestion or '', isLoading longWait copiedId initialSent abortRef scrollContainerRef bottomRef isNearBottomRef, messages initial welcome role assistant text "Halo, saya Virtual CS Polyflow. Saya bisa bantu cek data operasional dan panduan pemakaian sistem. Saya tidak bisa mengubah data, jadi revisi tetap dilakukan lewat UI Polyflow ya." Quick chips array: 'Cara buat Sales Order?','Cek stok kritis','Cara terima barang?','SPK yang sedang jalan','Invoice belum lunas','Cara input stok awal','Role & permission user','Cara eskalasi masalah'. RenderRichText splits lines ol regex number. etc ul - * . headings ## . inlineFormat pattern code **bold** [label](url) http(s):// and /support/[slug] internal links rendered as <a> or Link. TypingDots with bounce delay and longWait after 12s "Masih memproses…". CitedArticleCards if articles length 0 return null else map slice 0 3 Link /support/slug flex items-start gap-2 rounded-xl border brand-border bg-brand-glass p-3 hover brand-glass-heavy group/card BookOpen icon primary/10, title line-clamp-1 font-semibold group hover primary, summary line-clamp-1 11px muted, Buka → 11px primary shrink. Chat state container border brand-border bg-brand-glass backdrop blur rounded-3xl shadow brand. Header brand-border bg-brand-glass-heavy px-5 py-4 gradient radial primary transparent + title Polyflow Support 11px uppercase tracking 0.18em primary, h2 Virtual CS (Read-Only) lg font-semibold, subtitle 11px muted Panduan & cek data · tidak mengubah transaksi + shield icon ShieldCheck primary border. Scroll area flex-1 overflow-y-auto onScroll checkNearBottom scrollTop scrollHeight clientHeight <120 near bottom. Messages map: assistant left Bot avatar 8x8 rounded-full bg-brand-glass-heavy primary border heavy shadow + bubble rounded-2xl rounded-tl-sm px-4 py-3 backdrop blur border brand-border bg-brand-glass-heavy text-foreground renderRichText + cited cards + copy button Copy/Check icons opacity 0 group hover 100 + feedback thumbs if interactionId and !feedback ThumbsUp green hover + ThumbsDown red hover. Feedback state shows span Terima kasih! green or Feedback dicatat red. User right User avatar bg-brand-glass border shadow + bubble gradient primary to primary/90 text primary-foreground rounded-tr-sm. isLoading shows TypingDots + Cancel button X icon Batalkan border border-border rounded-full px-3 py-1 muted hover foreground.
- Form: border-t brand-border bg-brand-glass-heavy p-4 backdrop blur, if messages length <=1 show chips flex wrap gap-2 button chips rounded-full border brand-border bg-brand-glass hover heavy muted hover foreground. Input area flex items-end gap-2 rounded-xl border brand-border bg-brand-glass/50 p-2 shadow-inner focus-within border-heavy bg-heavy transition: Textarea min-h 44 max-h 120 flex-1 resize-none border-0 bg-transparent py-2.5 px-2 shadow-none focus ring 0 slate-900 dark slate-100 placeholder slate-500 font-medium value question onChange setQuestion placeholder "Ketik pertanyaan… Enter kirim, Shift+Enter baris baru" disabled isLoading autoFocus onKeyDown Enter without shift prevent if canSend sendQuestion. If isLoading Button outline X Cancel else Button submit disabled !canSend gap-2 shadow-md hover scale 1.02 Send icon Kirim. Below flex justify between hint 10px muted Enter kirim · Shift+Enter baris baru + nearLimit char count >=1800 shows count/2000 red if >=2000 amber else. canSend memo question trim length>0 && !isLoading, nearLimit >=1800, charCount length.
- Feedback sendFeedback optimistic update prev feedback, fetch /api/chat/feedback POST interactionId feedback, if !ok revert.
- sendQuestion payload incoming ?? question trim if !payload or loading return, push user message, setQuestion '' isLoading true longWait false, AbortController, fetch /api/chat POST question signal, json ChatApiResponse success error data answer interactionId citedArticles safety allowed blockedReason. If !ok push assistant error "Maaf, sistem sedang sibuk..." else push assistant data answer interactionId citedArticles. Catch AbortError "Permintaan dibatalkan." else "Koneksi ke server terputus."

## Yang Bisa
- Cek stok Stok → Stok /warehouse/inventory Stock Reserved Available
- Sales Order pending active /sales/orders Active/Pending filter
- SPK aktif /production/orders or /production/daily etc
- Finance piutang Invoice & Piutang Terima Bayar
- Panduan step (grounded) cara-buat-sales-order etc mention path Penjualan → Sales Order → Pesanan Baru etc

## Tidak Bisa
- Mutasi data: tidak bisa membuat/edit/hapus transaksi SO SJ SPK stok invoice, konfirmasi SO tombol Konfirmasi Order harus UI, Tandai Dikirim harus gudang Antrian Muat, ubah stok via Penyesuaian Stok.
- No sensitive password etc cross tenant.
- No non-operational.

## Cara Tanya Bagus
- Spesifik "Cek stok MP 15 di Gudang A" vs generic.
- Sebut nomor SO-2026-0001.
- Path real Antrian Muat not Warehouse Outgoing lama.

## Beda Lama
- Support → Bantuan mainNavLabels.help
`,
modules: ['global'], tags: ['virtual-cs','bantuan','chat','grounded'], errorCodes: [], source: 'SEED' as HelpArticleSource,
},
{
slug: 'cara-beri-feedback-dan-eskalasi',
title: 'Cara Beri Feedback & Eskalasi ke Tim Support',
summary: 'Feedback thumbs copy di Virtual CS dan eskalasi via Bantuan Cara Pakai Troubleshooting CS dan admin dengan template path real.',
bodyMd: `## Cara Beri Feedback

1. Setelah Virtual CS menjawab, klik **👍** jika membantu atau **👎** jika tidak.
2. Feedback masuk ke sistem untuk perbaikan artikel.
3. Jika jawaban salah, jelaskan di chat: "Menu Sales→Sales Order tombol Pesanan Baru, bukan + Baru".

## Cara Eskalasi

**Opsi 1 — Lanjut di Chat Virtual CS:**
Jelaskan detail masalah: nomor order, nama produk, langkah yang sudah dicoba, error yang muncul.

**Opsi 2 — Hubungi Admin:**
Admin bisa cek data, atur permission, dan bantu troubleshooting.

**Opsi 3 — Cek Artikel Langsung:**
Buka Bantuan → Cara Pakai atau Troubleshooting untuk panduan mandiri.

### Catatan Teknis

Menu: Bantuan (sidebar mainNavLabels.help) → Cara Pakai /support Module Chips ?module= sales warehouse production finance access global + ArticleGrid, Troubleshooting /support/troubleshooting, Tanya Virtual CS /support/cs, Detail /support/[slug] (slug page)
ContextualHelp component "Butuh bantuan?" title prefillQuestion links 2-3 articles quick in transaction pages (Sales Orders: Cara Buat Sales Order Cara Confirm SO Stok Kurang Jadwal Kirim & SJ; Inventory: Cara Cek Stok Cara Terima Barang Error Backflush; Finance Invoices: Cara Lihat Invoice Belum Lunas Error Period Locked; Production Orders: Cara Buat SPK Cara Input Hasil via Kiosk Error Backflush; Settings: Cara Atur Role & Permission Menu Tidak Muncul — ContextualHelpProps links title prefillQuestion)
Tombol: 👍 👎 ThumbsUp ThumbsDown feedback, Copy Check, Send, Questions chips.

## Feedback

- Setelah Virtual CS jawab di /support/cs:
  - Copy button Copy/Check icons.
  - 👍 Membantu ThumbsUp green hover bg-green-50 dark green-950
  - 👎 Tidak membantu ThumbsDown red hover
  - Feedback recorded via /api/chat/feedback POST interactionId feedback UP|DOWN optimistic.
  - Masuk HelpInteraction (question outcome etc) + HelpQuestionCluster for learning (only FAILED/PARTIAL/BLOCKED clustered).
  - If wrong label suggest detail "Menu Sales→Sales Order tombol Pesanan Baru, bukan + Baru" etc improves article rewrite.

## Eskalasi

Opsi1 Chat konteks Virtual CS:

- Lanjut di /support/cs
- Jelaskan detail: nomor order orderNumber SO-xxxx DO-xxxx SPK-xxxx, nama produk, SKU, screenshot error, path real you followed e.g. Stok → Antrian Muat /warehouse/outgoing/[id] → Mulai Muat → Verifikasi Muat Samakan semua ke perintah → Kunci Verifikasi → Tandai Dikirim fails.
- Mention error codes toast: CREDIT_LIMIT_EXCEEDED, MISSING_DEFAULT_BOM, FG_DEMAND_QUEUED, WO_CREATE_FAILED, STOCK_INSUFFICIENT, MATERIAL_INSUFFICIENT, BACKFLUSH_FAILED, PERIOD_LOCKED, POSTING_PERIOD_CLOSED, PERMISSION_DENIED, ACCESS_DENIED.
- Virtual CS will cite article.

Opsi2 Hubungi admin perusahaan:

- Admin di Pengaturan → Pengguna /dashboard/settings?tab=users tab list user role. Can edit data, permission access ?tab=access auto-save, period /finance/periods.
- For stock reservation issues admin cek Stok → Stok /warehouse/inventory variantTotals Terpesan etc + Antrian Muat outgoing.
- For permission admin check Kontrol Akses tree.

Opsi3 KB langsung:

- Bantuan sidebar.
- Cara Pakai /support list 15 published filter chip sales warehouse production finance access global.
- Troubleshooting /support/troubleshooting error articles backflush period locked permission menu.
- Tanya Virtual CS /support/cs chat grounded citedArticleCards.
- From transaction pages ContextualHelp ? prefillQuestion e.g. "Cara membuat Sales Order di Polyflow?" + links 3 articles releven click opens /support/[slug].

## Template Eskalasi (copy)

"Saya coba buat SO di Penjualan → Sales Order → Pesanan Baru path /sales/orders/create?intent=stock pilih Customer Budi Gudang Gudang A qty 10 BAL. Saat Konfirmasi Order di /sales/orders/[id] muncul warning FG_DEMAND_QUEUED. Sudah cek Stok → Stok /warehouse/inventory stok Tersedia 2 Terpesan 5 lowStock. Mohon cek apakah perlu buat SPK di Produksi → Permintaan FG /production/requests?"

Tambah info: versi app v{appVersion} dari Pengaturan → Sistem ?tab=system shows erpVersion environment serverStatus Online.

## Tips
- Sertakan path real, tombol real exact label e.g. Pesanan Baru, Konfirmasi Order, Buat Surat Jalan, Tambah ke Jadwal, Lihat SJ aktif, Ubah qty kirim Simpan qty, Mulai Muat, Samakan semua ke perintah, Simpan Verifikasi, Kunci Verifikasi, Tandai Dikirim, Terima dari Nota, Terima / Terima Sisa, Simpan Penerimaan Barang, Buat SPK, Rilis SPK, Mulai Produksi, Selesai SPK, Catat Hasil, Kirim Hasil, Tutup/Buka Kembali, Buat Periode, Izin disimpan.
- Status real: SO DRAFT CONFIRMED IN_PRODUCTION READY_TO_SHIP SHIPPED DELIVERED etc labels salesStatusLabels Draft Terkonfirmasi Dalam Produksi Siap Kirim Dikirim Terkirim. Delivery PENDING Menunggu LOADING Sedang Dimuat etc DELIVERY_STATUS_LABELS. Production DRAFT Draft WAITING_MATERIAL Menunggu Bahan RELEASED Siap Produksi IN_PROGRESS Sedang Diproduksi COMPLETED Produksi Selesai etc productionStatusLabels. Invoice UNPAID Belum Dibayar PARTIAL Dibayar Sebagian PAID Lunas OVERDUE Lewat Jatuh Tempo financeStatusLabels etc.
- Jika butuh push deploy darurat jangan build di VPS — CI GitHub Actions production.yml build → ghcr.io/clarinovist/polyflow:latest → VPS docker compose pull + restart polyflow-app (container name). Check logs docker logs --tail 100 grep migrat|HelpQuestionCluster snapshot etc plus prisma migrate status harus Database schema is up to date! plus psql Help tables counts.

## Beda Lama
- Support → Bantuan
- Seed sebut Support EN → real ID Bantuan
`,
modules: ['global'], tags: ['feedback','eskalasi','bantuan','template'], errorCodes: [], source: 'SEED' as HelpArticleSource,
},
];
async function seedHelpArticles(){
console.log('Seeding help articles (v2 refined)...');
for(const article of seedArticles){
const existing = await mainDb.helpArticle.findUnique({where:{slug:article.slug}});
if(existing){
await mainDb.helpArticle.update({where:{slug:article.slug}, data:{title:article.title,summary:article.summary,bodyMd:article.bodyMd,modules:article.modules,tags:article.tags,errorCodes:article.errorCodes,source:article.source}});
console.log(`  [UPD] ${article.slug}`);
continue;
}
await mainDb.helpArticle.create({data:{...article,status:HelpArticleStatus.PUBLISHED,publishedAt:new Date(),version:1}});
console.log(`  [OK] ${article.slug}`);
}
const total = await mainDb.helpArticle.count();
console.log(`\nDone total ${total}`);
}
seedHelpArticles().catch(e=>{console.error('Seed failed',e);process.exit(1)}).finally(()=>mainDb.$disconnect());
