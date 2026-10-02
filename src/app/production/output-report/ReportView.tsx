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
    ORDER_STATUS_LABELS,
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
type ProductIdentity = Pick<
    OutputIdentity,
    'productName' | 'variantName' | 'sku' | 'productType'
>;
function Product({ item }: { item: ProductIdentity }) {
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

function ScrapPercent({
    percent,
    produced,
    scrapKg,
}: {
    percent: string | null;
    produced: string;
    scrapKg: string | null;
}) {
    if (scrapKg === null) {
        return (
            <span
                title="Persentase affal tidak dapat dihitung karena satuannya belum pasti"
                aria-label="Persentase affal tidak dapat dihitung"
            >
                —*
            </span>
        );
    }
    if (percent === null) {
        return (
            <span
                title="Persentase affal tidak dapat dihitung karena hasil dan affal sama-sama nol"
                aria-label="Persentase affal tidak dapat dihitung"
            >
                —
            </span>
        );
    }
    return (
        <div>
            <p className="font-semibold">{fmt(percent)}%</p>
            <p className="text-xs font-normal text-muted-foreground">
                {fmt(scrapKg)} / {fmt(Number(produced) + Number(scrapKg))} kg
            </p>
        </div>
    );
}

function SummaryCard({
    label,
    value,
    description,
}: {
    label: string;
    value: number;
    description: string;
}) {
    return (
        <Card className="gap-2 py-4 shadow-none">
            <CardContent className="px-4">
                <p className="text-xs font-medium text-muted-foreground">
                    {label}
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums">
                    {fmt(value)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                    {description}
                </p>
            </CardContent>
        </Card>
    );
}

function ReportInsights({ report }: { report: OutputReport }) {
    const { filter, summary } = report;
    const maxByUnit = new Map<string, number>();
    for (const total of summary.totals) {
        const produced = Number(total.produced);
        maxByUnit.set(
            total.unit,
            Math.max(maxByUnit.get(total.unit) ?? 0, produced),
        );
    }
    const highestScrap = [...summary.productsProduced]
        .filter((item) => item.scrapKg !== null && Number(item.scrapKg) > 0)
        .sort((a, b) => Number(b.scrapKg) - Number(a.scrapKg))
        .slice(0, 4);

    return (
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(19rem,0.7fr)]">
            <section className="overflow-hidden rounded-xl border bg-card" aria-labelledby="output-summary-heading">
                <div className="border-b px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 id="output-summary-heading" className="text-sm font-semibold">
                            Output per proses
                        </h2>
                        <Badge variant="secondary">
                            {fmt(summary.totals.length)} kelompok
                        </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                        Panjang bar dibandingkan hanya dengan output bersatuan sama.
                    </p>
                </div>
                <ul className="max-h-52 divide-y overflow-y-auto">
                    {summary.totals.map((item) => {
                        const maximum = maxByUnit.get(item.unit) ?? 0;
                        const width = maximum > 0
                            ? Math.max(3, (Number(item.produced) / maximum) * 100)
                            : 0;
                        return (
                            <li key={`${item.process}:${item.unit}`} className="px-4 py-3">
                                <div className="flex items-baseline justify-between gap-4 text-sm">
                                    <span className="font-medium">
                                        {PROCESS_LABELS[item.process]}
                                    </span>
                                    <span className="font-semibold tabular-nums">
                                        {fmt(item.produced)} {item.unit}
                                    </span>
                                </div>
                                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                                    <div
                                        className="h-full rounded-full bg-primary/70"
                                        style={{ width: `${width}%` }}
                                    />
                                </div>
                            </li>
                        );
                    })}
                </ul>
            </section>

            <section className="overflow-hidden rounded-xl border bg-card" aria-labelledby="scrap-summary-heading">
                <div className="border-b px-4 py-3">
                    <div className="flex items-center gap-1">
                        <h2 id="scrap-summary-heading" className="text-sm font-semibold">
                            Affal terbesar tercatat
                        </h2>
                        <InfoHint label="Info urutan affal">
                            Diurutkan berdasarkan nominal kilogram, bukan status mutu
                            atau ambang masalah.
                        </InfoHint>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                        Indikator penelusuran, bukan penilaian kualitas.
                    </p>
                </div>
                {highestScrap.length > 0 ? (
                    <ol className="max-h-52 divide-y overflow-y-auto">
                        {highestScrap.map((item) => (
                            <li
                                key={`${item.productVariantId}:${item.process}:${item.unit}`}
                                className="flex items-center justify-between gap-3 px-4 py-3"
                            >
                                <div className="min-w-0">
                                    <Link
                                        prefetch={false}
                                        href={outputReportHref(filter, {
                                            mode: 'entries',
                                            productVariantId: item.productVariantId,
                                            process: item.process,
                                            page: 1,
                                        })}
                                        className="block truncate text-sm font-medium underline-offset-4 hover:underline"
                                    >
                                        {item.productName}
                                    </Link>
                                    <p className="truncate text-xs text-muted-foreground">
                                        {item.variantName !== item.productName && `${item.variantName} · `}
                                        {PROCESS_LABELS[item.process]} · hasil {fmt(item.produced)} {item.unit}
                                    </p>
                                </div>
                                <Badge variant="outline" className="shrink-0 tabular-nums">
                                    {fmt(item.scrapKg!)} kg
                                </Badge>
                            </li>
                        ))}
                    </ol>
                ) : (
                    <p className="px-4 py-6 text-sm text-muted-foreground">
                        Tidak ada affal kg yang tercatat pada periode ini.
                    </p>
                )}
            </section>
        </div>
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
    const perOrder = filter.mode === 'order';
    const activeProcesses = new Set(summary.totals.map((item) => item.process)).size;
    return (
        <div className="min-w-0 space-y-5">
            <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">
                        Rekap Hasil Produksi
                    </h1>
                    <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                        Pantau hasil, affal, operator, dan pencapaian SPK dalam satu tampilan.
                    </p>
                </div>
                <Badge variant="outline" className="w-fit py-1.5 font-normal tabular-nums">
                    {filter.from} – {filter.to} WIB
                </Badge>
            </header>
            <ReportFilters
                key={outputReportHref(filter)}
                filter={filter}
                options={report.options}
                today={today}
            />
            <section aria-label="Ringkasan laporan" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                <SummaryCard
                    label="Varian produk"
                    value={summary.products}
                    description="Memiliki hasil sesuai filter"
                />
                <SummaryCard
                    label="Entri hasil"
                    value={summary.entries}
                    description="Seluruh catatan dalam periode"
                />
                <SummaryCard
                    label="SPK unik"
                    value={summary.orders}
                    description="SPK yang menghasilkan output"
                />
                <SummaryCard
                    label="Proses aktif"
                    value={activeProcesses}
                    description="Jenis proses yang tercatat"
                />
            </section>
            {summary.entries > 0 && <ReportInsights report={report} />}
            <section className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-sm [&_[data-slot=table-container]]:max-h-[70vh] [&_[data-slot=table-container]]:overflow-auto">
                <div className="space-y-3 border-b p-4">
                    <nav
                        aria-label="Tampilan rekap"
                        className="flex w-fit max-w-full flex-wrap gap-1 rounded-lg bg-muted/50 p-1"
                    >
                        {Object.entries(REPORT_MODES).map(([mode, label]) => (
                            <Button
                                key={mode}
                                asChild
                                variant={
                                    filter.mode === mode ? 'default' : 'ghost'
                                }
                                className="h-11 xl:h-10"
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
                            {perOrder
                                ? 'Tidak ada SPK dengan hasil produksi pada periode ini.'
                                : 'Tidak ada hasil produksi sesuai filter.'}
                        </p>
                        <p className="text-sm text-muted-foreground">
                            {perOrder
                                ? 'Pencapaian hanya muncul untuk SPK yang memiliki hasil tercatat pada periode ini. Coba ubah periode atau filter.'
                                : 'Coba ubah periode, proses, produk, atau operator. Data kosong bukan berarti produk tidak dapat diproduksi.'}
                        </p>
                    </div>
                ) : (
                    <Table>
                        <TableHeader className="sticky top-0 z-10 bg-card">
                            <TableRow>
                                {perOrder ? (
                                    <>
                                        <TableHead>SPK</TableHead>
                                        <TableHead>Produk / Varian</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">
                                            Target
                                        </TableHead>
                                        <TableHead className="text-right">
                                            Aktual periode
                                        </TableHead>
                                        <TableHead className="text-right">
                                            Aktual kumulatif SPK
                                        </TableHead>
                                        <TableHead className="text-right">
                                            Selisih
                                        </TableHead>
                                        <TableHead className="text-right">
                                            Pencapaian
                                        </TableHead>
                                    </>
                                ) : (
                                    <>
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
                                                    <span className="inline-flex items-center justify-end gap-1">
                                                        % Affal
                                                        <InfoHint label="Info persentase affal">
                                                            Affal ÷ (hasil bersih + affal) × 100.
                                                            Hanya dihitung jika hasil dan affal
                                                            sama-sama tercatat dalam kg.
                                                        </InfoHint>
                                                    </span>
                                                </TableHead>
                                                <TableHead>
                                                    <span className="sr-only">
                                                        Aksi
                                                    </span>
                                                </TableHead>
                                            </>
                                        )}
                                    </>
                                )}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {perOrder
                                ? report.orders.map((row) => (
                                      <TableRow key={row.orderId}>
                                          <TableCell>
                                              {canViewOrders ? (
                                                  <Link
                                                      prefetch={false}
                                                      href={`/production/orders/${row.orderId}`}
                                                      className="text-primary underline underline-offset-4"
                                                  >
                                                      {row.orderNumber}
                                                  </Link>
                                              ) : (
                                                  <span>{row.orderNumber}</span>
                                              )}
                                              <p className="text-xs text-muted-foreground">
                                                  Rencana:{' '}
                                                  {formatWIB(
                                                      row.plannedStartDate,
                                                      'dd/MM/yyyy',
                                                  )}
                                              </p>
                                          </TableCell>
                                          <TableCell>
                                              <Product item={row} />
                                          </TableCell>
                                          <TableCell>
                                              {ORDER_STATUS_LABELS[
                                                  row.status
                                              ] ?? row.status}
                                          </TableCell>
                                          <TableCell className="text-right tabular-nums">
                                              {row.hasTarget ? (
                                                  <>
                                                      {fmt(row.target)}{' '}
                                                      {row.unit}
                                                  </>
                                              ) : (
                                                  <span className="text-muted-foreground">
                                                      Tanpa target
                                                  </span>
                                              )}
                                          </TableCell>
                                          <TableCell className="text-right tabular-nums">
                                              {fmt(row.producedInPeriod)}{' '}
                                              {row.unit}
                                          </TableCell>
                                          <TableCell className="text-right font-semibold tabular-nums">
                                              {fmt(row.producedCumulative)}{' '}
                                              {row.unit}
                                          </TableCell>
                                          <TableCell
                                              className={`text-right tabular-nums ${
                                                  row.difference !== null &&
                                                  Number(row.difference) < 0
                                                      ? 'text-destructive'
                                                      : ''
                                              }`}
                                          >
                                              {row.difference === null
                                                  ? '—'
                                                  : `${fmt(row.difference)} ${row.unit}`}
                                          </TableCell>
                                          <TableCell className="text-right tabular-nums">
                                              {row.achievement === null
                                                  ? '—'
                                                  : `${fmt(row.achievement)}%`}
                                          </TableCell>
                                      </TableRow>
                                  ))
                                : details
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
                                              <ScrapPercent
                                                  percent={row.scrapPercent}
                                                  produced={row.produced}
                                                  scrapKg={row.scrapKg}
                                              />
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
                {perOrder && (
                    <p>
                        Target berasal dari rencana SPK, bukan target harian
                        atau per shift. Aktual kumulatif menghitung seluruh
                        hasil SPK yang belum dibatalkan; aktual periode hanya
                        yang tercatat pada rentang tanggal ini. Selisih negatif
                        berarti sisa pekerjaan, dan pencapaian di atas 100%
                        ditampilkan apa adanya.
                    </p>
                )}
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
