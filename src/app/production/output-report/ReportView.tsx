import Link from 'next/link';
import { InfoHint } from '@/components/common/InfoHint';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { formatWIB } from '@/lib/utils/timezone';
import {
    PROCESS_LABELS,
    REPORT_MODES,
    outputReportHref,
    type OutputReport,
    type OutputIdentity,
} from '@/lib/production/output-report';
import { ReportFilters } from './ReportFilters';

const fmt = (value: string | number) =>
    Number(value).toLocaleString('id-ID', { maximumFractionDigits: 4 });
const TYPES: Record<string, string> = {
    WIP: 'Setengah jadi (WIP)',
    INTERMEDIATE: 'Setengah jadi',
    FINISHED_GOOD: 'Barang jadi',
    RAW_MATERIAL: 'Bahan baku',
    SCRAP: 'Scrap',
};
function Product({ item }: { item: OutputIdentity }) {
    return (
        <div className="min-w-48 whitespace-normal">
            <p className="font-medium">{item.productName}</p>
            {item.variantName !== item.productName && (
                <p className="text-sm">{item.variantName}</p>
            )}
            <p className="text-xs text-muted-foreground font-mono">
                {item.sku}
            </p>
            <Badge variant="outline" className="mt-1 text-xs">
                {TYPES[item.productType] ?? item.productType}
            </Badge>
        </div>
    );
}
function Scrap({ kg }: { kg: string | null }) {
    return kg === null ? (
        <span
            title="Satuan affal belum dapat dipastikan"
            aria-label="Satuan affal belum dapat dipastikan"
        >
            —*
        </span>
    ) : (
        <span>{fmt(kg)} kg</span>
    );
}

export function ReportView({
    report,
    canViewOrders,
    today,
}: {
    report: OutputReport;
    canViewOrders: boolean;
    today: string;
}) {
    const { filter, summary } = report;
    const details = filter.mode === 'entries';
    return (
        <div className="space-y-6 min-w-0">
            <header>
                <h1 className="text-3xl font-bold tracking-tight">
                    Rekap Hasil Produksi
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Hasil tercatat per produk dan operator — mixing, extru,
                    packing, termasuk barang setengah jadi.
                </p>
            </header>
            <ReportFilters
                key={outputReportHref(filter)}
                filter={filter}
                options={report.options}
                today={today}
            />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                    ['Varian produk', summary.products],
                    ['Entri hasil', summary.entries],
                    ['SPK unik', summary.orders],
                ].map(([label, total]) => (
                    <Card key={label}>
                        <CardContent className="pt-5">
                            <p className="text-xs text-muted-foreground">
                                {label}
                            </p>
                            <p className="text-2xl font-bold tabular-nums">
                                {fmt(total)}
                            </p>
                        </CardContent>
                    </Card>
                ))}
            </div>
            {summary.totals.length > 0 && (
                <section
                    aria-label="Hasil per proses dan satuan"
                    className="rounded-xl border bg-card p-4"
                >
                    <div className="mb-3 flex items-center gap-1">
                        <h2 className="font-semibold text-sm">Hasil bersih sesuai filter</h2>
                        <InfoHint label="Info hasil per proses dan satuan">
                            Hasil tidak dijumlah antarproses atau satuan karena
                            satu barang dapat melewati beberapa tahap produksi.
                        </InfoHint>
                    </div>
                    <div className="flex flex-wrap gap-x-8 gap-y-3">
                        {summary.totals.map((total) => (
                            <div key={`${total.process}:${total.unit}`}>
                                <p className="text-xs text-muted-foreground">
                                    {PROCESS_LABELS[total.process]} ·{' '}
                                    {total.unit}
                                </p>
                                <p className="font-bold tabular-nums">
                                    {fmt(total.produced)}{' '}
                                    <span className="text-xs font-normal">
                                        {total.unit}
                                    </span>
                                </p>
                            </div>
                        ))}
                    </div>
                </section>
            )}
            <section className="rounded-xl border bg-card min-w-0 overflow-hidden">
                <div className="p-4 space-y-3 border-b">
                    <nav
                        aria-label="Tampilan rekap"
                        className="flex flex-wrap gap-2"
                    >
                        {Object.entries(REPORT_MODES).map(([mode, label]) => (
                            <Button
                                key={mode}
                                asChild
                                variant={
                                    filter.mode === mode ? 'default' : 'outline'
                                }
                                className="h-11"
                            >
                                <Link
                                    prefetch={false}
                                    href={outputReportHref(filter, {
                                        mode: mode as typeof filter.mode,
                                        page: 1,
                                    })}
                                    aria-current={
                                        filter.mode === mode
                                            ? 'page'
                                            : undefined
                                    }
                                >
                                    {label}
                                </Link>
                            </Button>
                        ))}
                    </nav>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <span>{filter.from} – {filter.to} WIB · {fmt(summary.entries)} entri sesuai filter</span>
                        <InfoHint label="Info cakupan laporan hasil">
                            Ringkasan menghitung seluruh entri sesuai filter,
                            bukan hanya halaman tabel ini.
                        </InfoHint>
                    </div>
                    <p className="text-xs text-muted-foreground lg:hidden">
                        Geser tabel ke samping untuk melihat semua kolom.
                    </p>
                </div>
                {report.totalRows === 0 ? (
                    <div className="p-10 text-center space-y-2">
                        <p className="font-medium">
                            Tidak ada hasil produksi sesuai filter.
                        </p>
                        <p className="text-sm text-muted-foreground">
                            Coba ubah periode, proses, produk, atau operator.
                            Data kosong bukan berarti produk tidak dapat
                            diproduksi.
                        </p>
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                {details && (
                                    <TableHead>Tanggal / SPK</TableHead>
                                )}
                                <TableHead>Produk / Varian</TableHead>
                                <TableHead>Proses</TableHead>
                                <TableHead>Operator</TableHead>
                                {details && <TableHead>Mesin</TableHead>}
                                <TableHead className="text-right">
                                    Hasil Bersih
                                </TableHead>
                                <TableHead className="text-right">
                                    Affal
                                </TableHead>
                                {!details && (
                                    <>
                                        <TableHead className="text-right">
                                            Entri / SPK
                                        </TableHead>
                                        <TableHead>
                                            <span className="sr-only">
                                                Aksi
                                            </span>
                                        </TableHead>
                                    </>
                                )}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {details
                                ? report.entries.map((entry) => (
                                      <TableRow key={entry.id}>
                                          <TableCell>
                                              <p>
                                                  {formatWIB(
                                                      entry.startTime,
                                                      'dd/MM/yyyy HH:mm',
                                                  )}
                                              </p>
                                              <p className="text-xs text-muted-foreground">
                                                  Selesai:{' '}
                                                  {entry.endTime
                                                      ? formatWIB(
                                                            entry.endTime,
                                                            'dd/MM/yyyy HH:mm',
                                                        )
                                                      : 'Masih berjalan'}
                                              </p>
                                              {canViewOrders ? (
                                                  <Link
                                                      prefetch={false}
                                                      href={`/production/orders/${entry.orderId}`}
                                                      className="text-primary underline underline-offset-4"
                                                  >
                                                      {entry.orderNumber}
                                                  </Link>
                                              ) : (
                                                  <span>
                                                      {entry.orderNumber}
                                                  </span>
                                              )}
                                          </TableCell>
                                          <TableCell>
                                              <Product item={entry} />
                                          </TableCell>
                                          <TableCell>
                                              {PROCESS_LABELS[entry.process]}
                                              {entry.process === 'OTHER' && (
                                                  <p className="text-xs text-muted-foreground">
                                                      {entry.category}
                                                  </p>
                                              )}
                                          </TableCell>
                                          <TableCell>
                                              {entry.operatorName}
                                              {entry.operatorSource ===
                                                  'shift' && (
                                                  <p className="text-xs text-muted-foreground">
                                                      Dari shift
                                                  </p>
                                              )}
                                          </TableCell>
                                          <TableCell>
                                              {entry.machineName}
                                          </TableCell>
                                          <TableCell className="text-right tabular-nums font-semibold">
                                              {fmt(entry.produced)} {entry.unit}
                                              {entry.enteredQuantity !==
                                                  null && (
                                                  <p className="text-xs font-normal text-muted-foreground">
                                                      Input:{' '}
                                                      {fmt(
                                                          entry.enteredQuantity,
                                                      )}{' '}
                                                      {entry.enteredUnit}
                                                  </p>
                                              )}
                                          </TableCell>
                                          <TableCell className="text-right tabular-nums">
                                              <Scrap kg={entry.scrapKg} />
                                              {entry.scrapKg === null && (
                                                  <p className="text-xs text-muted-foreground">
                                                      Tercatat:{' '}
                                                      {fmt(entry.scrapRaw)}{' '}
                                                      (satuan belum pasti)
                                                  </p>
                                              )}
                                          </TableCell>
                                      </TableRow>
                                  ))
                                : report.rows.map((row) => (
                                      <TableRow key={row.key}>
                                          <TableCell>
                                              <Product item={row} />
                                          </TableCell>
                                          <TableCell>
                                              {PROCESS_LABELS[row.process]}
                                          </TableCell>
                                          <TableCell>
                                              <div className="flex flex-col items-start gap-1">
                                                  {row.operators.map(
                                                      (operator) => (
                                                          <Link
                                                              key={operator.id}
                                                              prefetch={false}
                                                              href={outputReportHref(
                                                                  filter,
                                                                  {
                                                                      operatorId:
                                                                          operator.id,
                                                                      mode: 'operator',
                                                                      page: 1,
                                                                  },
                                                              )}
                                                              className="text-primary underline underline-offset-4"
                                                          >
                                                              {operator.label}
                                                          </Link>
                                                      ),
                                                  )}
                                              </div>
                                          </TableCell>
                                          <TableCell className="text-right font-semibold tabular-nums">
                                              {fmt(row.produced)} {row.unit}
                                          </TableCell>
                                          <TableCell className="text-right tabular-nums">
                                              <Scrap kg={row.scrapKg} />
                                          </TableCell>
                                          <TableCell className="text-right tabular-nums">
                                              {row.entries} / {row.orders}
                                          </TableCell>
                                          <TableCell>
                                              <Button
                                                  asChild
                                                  variant="outline"
                                                  size="sm"
                                                  className="min-h-11"
                                              >
                                                  <Link
                                                      prefetch={false}
                                                      href={outputReportHref(
                                                          filter,
                                                          {
                                                              mode: 'entries',
                                                              productVariantId:
                                                                  row.productVariantId,
                                                              process:
                                                                  row.process,
                                                              operatorId:
                                                                  row.operatorId ??
                                                                  filter.operatorId,
                                                              page: 1,
                                                          },
                                                      )}
                                                      aria-label={`Rincian ${row.variantName}`}
                                                  >
                                                      Rincian
                                                  </Link>
                                              </Button>
                                          </TableCell>
                                      </TableRow>
                                  ))}
                        </TableBody>
                    </Table>
                )}
                <div className="p-4 border-t flex flex-wrap justify-between items-center gap-3">
                    <p className="text-xs text-muted-foreground">
                        {fmt(report.totalRows)} baris · Halaman {filter.page} /{' '}
                        {report.pageCount}
                    </p>
                    <nav aria-label="Halaman laporan" className="flex gap-2">
                        {filter.page > 1 && (
                            <Button asChild variant="outline" className="h-11">
                                <Link
                                    prefetch={false}
                                    href={outputReportHref(filter, {
                                        page: filter.page - 1,
                                    })}
                                >
                                    Sebelumnya
                                </Link>
                            </Button>
                        )}
                        {filter.page < report.pageCount && (
                            <Button asChild variant="outline" className="h-11">
                                <Link
                                    prefetch={false}
                                    href={outputReportHref(filter, {
                                        page: filter.page + 1,
                                    })}
                                >
                                    Berikutnya
                                </Link>
                            </Button>
                        )}
                    </nav>
                </div>
            </section>
            <div className="text-xs text-muted-foreground space-y-1">
                <p>
                    Tanggal produksi mengikuti waktu mulai/shift dalam WIB.
                    Entri dibatalkan tidak dihitung. Operator memakai catatan
                    hasil; jika kosong, memakai operator shift.
                </p>
                <p>
                    * Affal non-kg belum memiliki satuan yang seragam; tidak
                    dijumlah atau dihitung persentasenya. Hasil memakai satuan
                    dasar varian, bukan satuan input kemasan.
                </p>
                <p>
                    Nama produk mengikuti output BOM/SPK. Laporan Packing dan
                    Log Hasil memakai waktu selesai sehingga periode lintas hari
                    dapat berbeda.
                </p>
            </div>
        </div>
    );
}
