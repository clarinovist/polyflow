import { getProductionAnalytics } from '@/actions/core/analytics';
import { AnalyticsToolbar } from '@/components/analytics/AnalyticsToolbar';
import { ProductionRealizationChart } from '@/components/analytics/ProductionRealizationChart';
import { MachinePerformanceCard } from '@/components/analytics/MachinePerformanceCard';
import { ScrapAnalysisChart } from '@/components/analytics/ScrapAnalysisChart';
import { OperatorLeaderboard } from '@/components/analytics/OperatorLeaderboard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Activity, Factory, AlertTriangle, CheckCircle, ExternalLink } from 'lucide-react';
import Link from 'next/link';

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

export default async function ProductionAnalyticsPage(props: { searchParams: SearchParams }) {
    const searchParams = await props.searchParams;
    const from = typeof searchParams.from === 'string' ? new Date(searchParams.from) : undefined;
    const to = typeof searchParams.to === 'string' ? new Date(searchParams.to) : undefined;

    const dateRange = from && to ? { from, to } : undefined;

    const dataRes = await getProductionAnalytics(dateRange);
    const data = dataRes.success && dataRes.data ? dataRes.data : {
        realization: [],
        materialVariance: [],
        machinePerformance: [],
        operatorProductivity: [],
        quality: { inspections: { total: 0, pass: 0, fail: 0, quarantine: 0, passRate: 0 }, scrapByReason: [], scrapByProduct: [] }
    };

    // Calculate aggregated stats
    const avgYield = data.realization.reduce((acc, curr) => acc + curr.yieldRate, 0) / (data.realization.length || 1);
    const totalScrap = data.quality.scrapByReason.reduce((acc, curr) => acc + curr.quantity, 0);
    const passRate = data.quality.inspections.passRate;
    const activeMachines = data.machinePerformance.filter(m => m.totalOperatingHours > 0).length;

    return (
        <div className="p-6 space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Analitik Produksi</h1>
                    <p className="text-sm text-muted-foreground mt-1">Kinerja periode + item yang perlu ditindak.</p>
                </div>
                <AnalyticsToolbar />
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Rata-rata Yield</CardTitle>
                        <CheckCircle className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{avgYield.toFixed(1)}%</div>
                        <p className="text-xs text-muted-foreground">
                            Dari {data.realization.length} SPK
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">QC Lulus</CardTitle>
                        <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{passRate.toFixed(1)}%</div>
                        <p className="text-xs text-muted-foreground">
                            {data.quality.inspections.total} inspeksi
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Scrap</CardTitle>
                        <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-600 dark:text-red-400">{totalScrap.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">
                            Unit ditolak
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Mesin Aktif</CardTitle>
                        <Factory className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{activeMachines}</div>
                        <p className="text-xs text-muted-foreground">
                            Dengan jam operasi tercatat
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Perlu ditindak — actionable lists */}
            <Card className="shadow-sm bg-card/65 backdrop-blur-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-bold">Perlu ditindak</CardTitle>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="scrap" className="w-full">
                  <TabsList className="h-auto flex-wrap mb-3">
                    <TabsTrigger value="scrap" className="text-xs font-bold">Scrap Tertinggi</TabsTrigger>
                    <TabsTrigger value="yield" className="text-xs font-bold">Yield Rendah</TabsTrigger>
                    <TabsTrigger value="machine" className="text-xs font-bold">Mesin Performa Rendah</TabsTrigger>
                  </TabsList>

                  <TabsContent value="scrap">
                    {data.quality.scrapByProduct.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4 text-center">Tidak ada data scrap.</p>
                    ) : (
                      <div className="space-y-2">
                        <div className="rounded-md border overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Produk</TableHead>
                                <TableHead className="text-right">Scrap</TableHead>
                                <TableHead className="text-right">% </TableHead>
                                <TableHead className="text-right">Aksi</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {data.quality.scrapByProduct.slice(0, 8).map((item) => (
                                <TableRow key={item.productVariantId}>
                                  <TableCell className="font-medium">{item.productName}</TableCell>
                                  <TableCell className="text-right tabular-nums">{item.quantity.toLocaleString()}</TableCell>
                                  <TableCell className="text-right">
                                    <Badge variant={item.percentage > 30 ? 'destructive' : 'secondary'} className="font-bold">
                                      {item.percentage.toFixed(1)}%
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {item.sampleProductionOrderId ? (
                                      <Link
                                        href={`/production/orders/${item.sampleProductionOrderId}`}
                                        className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1"
                                      >
                                        Buka SPK <ExternalLink className="h-3 w-3" />
                                      </Link>
                                    ) : (
                                      <Link href="/production/history" className="text-xs font-semibold text-primary hover:underline">
                                        Log
                                      </Link>
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                        <Link href="/production/history" className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1">
                          Lihat log hasil <ExternalLink className="h-3 w-3" />
                        </Link>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="yield">
                    {data.realization.filter(r => r.yieldRate < 90).length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4 text-center">Semua yield di atas threshold.</p>
                    ) : (
                      <div className="rounded-md border overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>SPK</TableHead>
                              <TableHead>Produk</TableHead>
                              <TableHead className="text-right">Yield</TableHead>
                              <TableHead className="text-right">Aksi</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {data.realization
                              .filter(r => r.yieldRate < 90)
                              .sort((a, b) => a.yieldRate - b.yieldRate)
                              .slice(0, 5)
                              .map((item) => (
                              <TableRow key={item.orderId || item.orderNumber}>
                                <TableCell className="font-medium">{item.orderNumber}</TableCell>
                                <TableCell>{item.productName}</TableCell>
                                <TableCell className="text-right">
                                  <Badge variant="destructive" className="font-bold">{item.yieldRate.toFixed(1)}%</Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                  <Link
                                    href={item.orderId ? `/production/orders/${item.orderId}` : `/production/orders?status=${item.status || 'IN_PROGRESS'}`}
                                    className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1"
                                  >
                                    Buka SPK <ExternalLink className="h-3 w-3" />
                                  </Link>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="machine">
                    {data.machinePerformance.filter(m => m.scrapRate > 2 || m.unitsPerHour < 50).length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4 text-center">Semua mesin dalam batas normal.</p>
                    ) : (
                      <div className="rounded-md border overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Mesin</TableHead>
                              <TableHead className="text-right">Output/Jam</TableHead>
                              <TableHead className="text-right">Scrap Rate</TableHead>
                              <TableHead className="text-right">Aksi</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {data.machinePerformance
                              .filter(m => m.scrapRate > 2 || m.unitsPerHour < 50)
                              .sort((a, b) => b.scrapRate - a.scrapRate)
                              .slice(0, 5)
                              .map((item) => (
                              <TableRow key={item.machineCode}>
                                <TableCell className="font-medium">{item.machineCode}</TableCell>
                                <TableCell className="text-right tabular-nums">{item.unitsPerHour.toFixed(1)}</TableCell>
                                <TableCell className="text-right">
                                  <Badge variant={item.scrapRate > 5 ? 'destructive' : 'secondary'} className="font-bold">
                                    {item.scrapRate.toFixed(1)}%
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                  <Link
                                    href={item.machineId ? `/production/machines/${item.machineId}` : '/production/machines'}
                                    className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1"
                                  >
                                    Buka mesin <ExternalLink className="h-3 w-3" />
                                  </Link>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            {/* Charts Row 1 */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <ProductionRealizationChart data={data.realization} />
                <MachinePerformanceCard data={data.machinePerformance} />
            </div>

            {/* Charts Row 2 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <ScrapAnalysisChart data={data.quality} />
                <div className="col-span-1 md:col-span-2">
                    <OperatorLeaderboard data={data.operatorProductivity} />
                </div>
            </div>
        </div>
    );
}
