import type { InventoryReconciliationDiagnosis } from '@/types/inventory-reconciliation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const number = (value: string, decimals = 2) =>
    new Intl.NumberFormat('id-ID', { maximumFractionDigits: decimals }).format(
        Number(value),
    );
const date = (value: string) =>
    new Date(value).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
const cell = 'px-3 py-2 text-left align-top';
const amountCell = `${cell} text-right tabular-nums whitespace-nowrap`;

export function InventoryReconciliationDetail({
    data,
}: {
    data: InventoryReconciliationDiagnosis;
}) {
    return (
        <section aria-label="Diagnosis nilai ATK" className="space-y-4">
            <Card>
                <CardHeader>
                    <CardTitle>
                        {data.variant.skuCode} — {data.variant.name}
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                        Diperiksa {date(data.checkedAt)} WIB.{' '}
                        {data.variant.archived && 'SKU diarsipkan.'}
                    </p>
                    <p className="font-medium">
                        {data.healthFlagged
                            ? 'Memenuhi kondisi alert basis ATK harian'
                            : 'Tidak memenuhi kondisi alert basis ATK harian'}
                    </p>
                    <dl className="grid gap-4 sm:grid-cols-3">
                        <div>
                            <dt>Nilai stok positif semua lokasi</dt>
                            <dd className="font-semibold tabular-nums">
                                Rp{number(data.stockValue, 4)}
                            </dd>
                        </div>
                        <div>
                            <dt>Basis jurnal SKU lintas lokasi</dt>
                            <dd className="font-semibold tabular-nums">
                                Rp{number(data.basisTotal)}
                            </dd>
                        </div>
                        <div>
                            <dt>Nilai stok − basis</dt>
                            <dd className="font-semibold tabular-nums">
                                Rp{number(data.difference, 4)}
                            </dd>
                        </div>
                    </dl>
                    <p className="text-sm text-muted-foreground">
                        Basis berasal dari jurnal otomatis POSTED tertaut ke
                        mutasi SKU pada akun persediaan yang memenuhi syarat.
                        Biaya kosong dihitung nol hanya untuk perbandingan
                        alert, bukan bukti harga nol. Selisih bukan nominal
                        koreksi yang boleh langsung diposting.
                    </p>
                    <p className="rounded-md border p-3 text-sm">
                        Kesiapan pemakaian belum diperiksa. Total basis yang
                        cocok tidak menjamin akun sumber, mapping, saldo GL,
                        reservasi dan jumlah transaksi memenuhi syarat.
                        Pemeriksaan transaksi tetap berlaku.
                    </p>
                    {data.findings.length ? (
                        <ul className="space-y-3">
                            {data.findings.map((finding) => (
                                <li
                                    key={finding.code}
                                    className="border-l-2 pl-3"
                                >
                                    <h3 className="font-medium">
                                        {finding.title}
                                    </h3>
                                    <p className="text-sm text-muted-foreground">
                                        {finding.nextStep}
                                    </p>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p>
                            Tidak ditemukan selisih pada pemeriksaan terbatas
                            ini. Bukan pengesahan biaya historis atau kesiapan
                            transaksi.
                        </p>
                    )}
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardTitle>Lokasi dan biaya stok saat ini</CardTitle>
                </CardHeader>
                <CardContent>
                    <div
                        role="region"
                        aria-label="Tabel stok per lokasi"
                        tabIndex={0}
                        className="overflow-x-auto"
                    >
                        <table className="w-full text-sm">
                            <thead>
                                <tr>
                                    <th className={cell}>Lokasi</th>
                                    <th className={amountCell}>
                                        Jumlah ({data.variant.unit})
                                    </th>
                                    <th className={amountCell}>
                                        WAC/unit (Rp)
                                    </th>
                                    <th className={amountCell}>
                                        Nilai lokasi (Rp)
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.locations.map((location) => (
                                    <tr key={location.id} className="border-t">
                                        <td className={cell}>
                                            {location.name}
                                            {!location.companyInternal && (
                                                <p className="text-xs">
                                                    Periksa kepemilikan/lokasi
                                                </p>
                                            )}
                                        </td>
                                        <td className={amountCell}>
                                            {number(location.quantity, 4)}
                                        </td>
                                        <td className={amountCell}>
                                            {location.averageCost === null
                                                ? 'Belum diketahui'
                                                : number(
                                                      location.averageCost,
                                                      4,
                                                  )}
                                        </td>
                                        <td className={amountCell}>
                                            {number(location.value, 4)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {!data.locations.length && <p>Tidak ada baris stok.</p>}
                    <p className="mt-3 text-sm text-muted-foreground">
                        WAC saat ini bukan bukti WAC historis. Nilai baris
                        negatif tetap ditampilkan; angka ringkasan alert hanya
                        memakai stok positif.
                    </p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardTitle>
                        Basis per akun — bukan saldo GL seluruh akun
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <ul className="space-y-2">
                        {data.basis.map((account) => (
                            <li
                                key={account.accountId}
                                className="flex flex-wrap justify-between gap-2 border-b pb-2"
                            >
                                <span>
                                    {account.code} · {account.name}
                                </span>
                                <span className="tabular-nums">
                                    Rp{number(account.value)}
                                </span>
                            </li>
                        ))}
                    </ul>
                    {!data.basis.length && (
                        <p>
                            Tidak ada basis tertaut yang memenuhi aturan sumber.
                        </p>
                    )}
                    <p className="mt-3 text-sm text-muted-foreground">
                        Basis milik SKU lintas lokasi, tidak dijumlahkan ulang
                        untuk setiap gudang. Saldo akun dari SKU lain tidak
                        menjadi bukti untuk barang ini.
                    </p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardTitle>Bukti mutasi dan jurnal sumber</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <p className="text-sm">
                        Menampilkan {data.movements.length} dari{' '}
                        {data.coverage.movementCount} mutasi, terbaru dahulu.
                        Urutan tanggal/ID bukan bukti urutan posting historis.
                    </p>
                    {data.coverage.movementsTruncated && (
                        <p role="status">
                            Riwayat mutasi dibatasi. Jangan menyimpulkan riwayat
                            lengkap dari daftar ini; minta tim sistem memeriksa
                            sumber lengkap.
                        </p>
                    )}
                    <div
                        role="region"
                        aria-label="Tabel mutasi"
                        tabIndex={0}
                        className="overflow-x-auto"
                    >
                        <table className="w-full text-sm">
                            <thead>
                                <tr>
                                    <th className={cell}>
                                        Tanggal WIB / mutasi
                                    </th>
                                    <th className={cell}>Jenis / lokasi</th>
                                    <th className={amountCell}>Jumlah</th>
                                    <th className={amountCell}>
                                        Biaya/unit (Rp)
                                    </th>
                                    <th className={cell}>Penerimaan</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.movements.map((movement) => (
                                    <tr key={movement.id} className="border-t">
                                        <td className={cell}>
                                            {date(movement.createdAt)}
                                            <p className="break-all text-xs text-muted-foreground">
                                                {movement.id}
                                            </p>
                                        </td>
                                        <td className={cell}>
                                            {movement.type}
                                            <p>
                                                {movement.from ?? '—'} →{' '}
                                                {movement.to ?? '—'}
                                            </p>
                                        </td>
                                        <td className={amountCell}>
                                            {number(movement.quantity, 4)}
                                        </td>
                                        <td className={amountCell}>
                                            {movement.cost === null
                                                ? 'Belum diketahui'
                                                : number(movement.cost, 4)}
                                        </td>
                                        <td className={cell}>
                                            {movement.receiptNumber ?? '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {data.coverage.journalsTruncated && (
                        <p role="status">
                            Daftar jurnal dibatasi 100; bukan seluruh jurnal
                            terkait.
                        </p>
                    )}
                    <p className="text-sm text-muted-foreground">
                        Jurnal di bawah hanya yang langsung menunjuk mutasi yang
                        ditampilkan. Tidak mencakup semua jurnal manual,
                        invoice, pembalik, atau koreksi tak tertaut. Nomor
                        sumber tersedia di sini tanpa memperluas izin modul
                        lain.
                    </p>
                    {data.journals.map((journal) => (
                        <details
                            key={journal.id}
                            className="rounded-md border p-3"
                        >
                            <summary className="cursor-pointer min-h-11">
                                {journal.number} · {journal.status} ·{' '}
                                {journal.referenceType ?? 'Tanpa tipe'} ·{' '}
                                {journal.autoGenerated ? 'Otomatis' : 'Manual'}
                            </summary>
                            <p className="my-2 break-all text-xs">
                                {date(journal.date)} WIB · Mutasi{' '}
                                {journal.movementId}
                            </p>
                            <div
                                role="region"
                                aria-label={`Baris jurnal ${journal.number}`}
                                tabIndex={0}
                                className="overflow-x-auto"
                            >
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr>
                                            <th className={cell}>Akun</th>
                                            <th className={amountCell}>
                                                Debit
                                            </th>
                                            <th className={amountCell}>
                                                Kredit
                                            </th>
                                            <th className={cell}>Mata uang</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {journal.lines.map((line, index) => (
                                            <tr
                                                key={index}
                                                className="border-t"
                                            >
                                                <td className={cell}>
                                                    {line.accountCode} ·{' '}
                                                    {line.accountName}
                                                </td>
                                                <td className={amountCell}>
                                                    {number(line.debit)}
                                                </td>
                                                <td className={amountCell}>
                                                    {number(line.credit)}
                                                </td>
                                                <td className={cell}>
                                                    {line.currency}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {journal.linesTruncated && (
                                <p>
                                    Baris jurnal dibatasi 20. Jangan menghitung
                                    keseimbangan dari cuplikan ini.
                                </p>
                            )}
                        </details>
                    ))}
                    {!data.journals.length && (
                        <p>
                            Tidak ada jurnal langsung pada mutasi yang
                            ditampilkan; bukan bukti tidak ada pembukuan lain.
                        </p>
                    )}
                </CardContent>
            </Card>
            {!!data.corrections?.length && <Card>
                <CardHeader><CardTitle>Riwayat koreksi nilai</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-sm">
                    <p>Nilai jurnal koreksi ikut basis SKU pada tanggal postingnya. Jurnal loss asli tetap utuh; pembalikan dicatat terpisah.</p>
                    {data.corrections.map(row => <div key={row.id} className="rounded-md border p-3 break-words">
                        <p>{row.kind} · Rp{number(row.amount)} · {date(row.postingDate)} WIB</p>
                        <p>Jurnal {row.journalNumber}</p><p className="break-all">Bukti {row.id} · sumber {row.sourceMovementId}</p>
                    </div>)}
                    {data.coverage.correctionsTruncated && <p>Riwayat koreksi dibatasi 100 catatan.</p>}
                </CardContent>
            </Card>}
            <Card>
                <CardHeader>
                    <CardTitle>Langkah penyelesaian</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                    <p>
                        <strong>
                            Diagnosis tidak otomatis memperbaiki catatan.
                        </strong>{' '}
                        Gunakan panel pemulihan untuk memeriksa kelayakan
                        koreksi loss terbatas. Saldo awal, biaya nol, dan sumber
                        ambigu tetap memerlukan bukti serta review Finance.
                    </p>
                    <p>
                        Jangan membuat penerimaan, mengubah jumlah opname, atau
                        mengisi harga master hanya agar alert hilang. Biaya nol
                        yang disengaja memerlukan keputusan Finance; pemeriksaan
                        ini tidak mengubah keputusan atau guard transaksi.
                    </p>
                    <p>
                        Tidak ada perubahan stok atau jurnal dari diagnosis.
                        Koreksi hanya disimpan setelah preview dan persetujuan;
                        jika tidak memenuhi syarat, jangan mengubah jumlah agar
                        lolos.
                    </p>
                </CardContent>
            </Card>
        </section>
    );
}
