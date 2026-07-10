'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Truck, Download, TrendingUp, TrendingDown, DollarSign, Package } from 'lucide-react';
import { getShippingCostReport } from '@/actions/sales/shipping-reports';
import { getVehicles } from '@/actions/sales/vehicles';

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount);
}

function formatMonth(monthStr: string): string {
  const [year, month] = monthStr.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${months[parseInt(month) - 1]} ${year}`;
}

interface Vehicle {
  id: string;
  plateNumber: string;
  name: string;
}

interface VehicleSummary {
  vehicleId: string;
  plateNumber: string;
  vehicleName: string;
  ownershipType: string;
  driverName: string | null;
  totalDeliveries: number;
  totalCost: number;
  totalCharge: number;
  totalMargin: number;
  avgCostPerDelivery: number;
}

interface MonthlySummary {
  month: string;
  totalDeliveries: number;
  totalCost: number;
  totalCharge: number;
  totalMargin: number;
}

interface OwnershipSummary {
  ownershipType: string;
  label: string;
  totalDeliveries: number;
  totalCost: number;
  totalCharge: number;
  totalMargin: number;
}

interface ReportSummary {
  totalDeliveries: number;
  totalCost: number;
  totalCharge: number;
  totalMargin: number;
  avgCostPerDelivery: number;
  avgChargePerDelivery: number;
  byVehicle: VehicleSummary[];
  byMonth: MonthlySummary[];
  byOwnership: OwnershipSummary[];
}

interface DeliveryRow {
  id: string;
  orderNumber: string;
  deliveryDate: string;
  totalCost: number;
  totalCharge: number;
  appliedRateType: string | null;
  estimatedWeightKg: number | null;
  destinationAddress: string | null;
  status: string;
  vehicle: { plateNumber: string; name: string; ownershipType: string } | null;
  salesOrder: { orderNumber: string; customer: { name: string } | null } | null;
}

interface ReportData {
  summary: ReportSummary;
  deliveries: DeliveryRow[];
}

const OWNERSHIP_LABELS: Record<string, string> = {
  FACTORY: 'Pabrik',
  PRIVATE: 'Perorangan',
};

export function ShippingCostReportClient() {
  const [report, setReport] = useState<ReportData | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [filterVehicle, setFilterVehicle] = useState('ALL');
  const [filterOwnership, setFilterOwnership] = useState('ALL');
  const [activeTab, setActiveTab] = useState<'summary' | 'byVehicle' | 'byMonth' | 'detail'>('summary');

  const loadVehicles = useCallback(async () => {
    const res = await getVehicles({ status: 'ACTIVE' });
    if (res.success && res.data) {
      setVehicles(res.data as Vehicle[]);
    }
  }, []);

  useEffect(() => {
    loadVehicles();
  }, [loadVehicles]);

  const loadReport = useCallback(async () => {
    setIsLoading(true);
    try {
      const filters: Record<string, string | Date> = {};
      if (startDate) filters.startDate = new Date(startDate);
      if (endDate) filters.endDate = new Date(endDate + 'T23:59:59');
      if (filterVehicle !== 'ALL') filters.vehicleId = filterVehicle;
      if (filterOwnership !== 'ALL') filters.ownershipType = filterOwnership;

      const res = await getShippingCostReport(filters as unknown as Parameters<typeof getShippingCostReport>[0]);
      if (res.success && res.data) {
        setReport(res.data as ReportData);
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, [startDate, endDate, filterVehicle, filterOwnership]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const handleExportCSV = () => {
    if (!report) return;
    const rows = [
      ['No. DO', 'Tanggal', 'Armada', 'Tipe', 'Customer', 'Alamat Tujuan', 'Berat (Kg)', 'Biaya Oper.', 'Biaya Customer', 'Margin'],
      ...report.deliveries.map((d) => [
        d.orderNumber,
        new Date(d.deliveryDate).toLocaleDateString('id-ID'),
        d.vehicle?.plateNumber || '-',
        d.vehicle?.ownershipType === 'FACTORY' ? 'Pabrik' : 'Perorangan',
        d.salesOrder?.customer?.name || '-',
        d.destinationAddress || '-',
        d.estimatedWeightKg != null ? String(d.estimatedWeightKg) : '-',
        String(d.totalCost),
        String(d.totalCharge),
        String(d.totalCharge - d.totalCost),
      ]),
    ];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `laporan-pengiriman-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const summary = report?.summary;

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filter</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Dari Tanggal</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Sampai Tanggal</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Armada</Label>
              <Select value={filterVehicle} onValueChange={setFilterVehicle}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Semua Armada</SelectItem>
                  {vehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>{v.plateNumber} — {v.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Kepemilikan</Label>
              <Select value={filterOwnership} onValueChange={setFilterOwnership}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Semua</SelectItem>
                  <SelectItem value="FACTORY">Pabrik</SelectItem>
                  <SelectItem value="PRIVATE">Perorangan</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button variant="outline" onClick={handleExportCSV} disabled={!report} className="w-full">
                <Download className="h-4 w-4 mr-2" /> Export CSV
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Package className="h-4 w-4" /> Total Pengiriman
              </div>
              <p className="text-2xl font-bold mt-1">{summary.totalDeliveries}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Truck className="h-4 w-4" /> Total Biaya Oper.
              </div>
              <p className="text-2xl font-bold mt-1 text-red-600">{formatRupiah(summary.totalCost)}</p>
              <p className="text-xs text-muted-foreground">
                Rata-rata: {formatRupiah(summary.avgCostPerDelivery)}/kirim
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <DollarSign className="h-4 w-4" /> Total Biaya Customer
              </div>
              <p className="text-2xl font-bold mt-1 text-green-600">{formatRupiah(summary.totalCharge)}</p>
              <p className="text-xs text-muted-foreground">
                Rata-rata: {formatRupiah(summary.avgChargePerDelivery)}/kirim
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                {summary.totalMargin >= 0 ? (
                  <TrendingUp className="h-4 w-4 text-green-600" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-red-600" />
                )}
                Margin
              </div>
              <p className={`text-2xl font-bold mt-1 ${summary.totalMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatRupiah(summary.totalMargin)}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b pb-2">
        {[
          { key: 'summary' as const, label: 'Ringkasan per Armada' },
          { key: 'byMonth' as const, label: 'Per Bulan' },
          { key: 'detail' as const, label: 'Detail' },
        ].map((tab) => (
          <Button
            key={tab.key}
            variant={activeTab === tab.key ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {/* Tab Content */}
      {isLoading && (
        <div className="text-center py-8 text-muted-foreground">Memuat data...</div>
      )}

      {!isLoading && report && activeTab === 'summary' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ringkasan per Armada</CardTitle>
          </CardHeader>
          <CardContent>
            {summary && summary.byVehicle.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">
                Belum ada data pengiriman dengan armada.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Armada</TableHead>
                      <TableHead>Tipe</TableHead>
                      <TableHead>Sopir</TableHead>
                      <TableHead className="text-center"># Kirim</TableHead>
                      <TableHead className="text-right">Total Biaya Oper.</TableHead>
                      <TableHead className="text-right">Total Charge</TableHead>
                      <TableHead className="text-right">Margin</TableHead>
                      <TableHead className="text-right">Rata-rata/Kirim</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary?.byVehicle.map((v) => (
                      <TableRow key={v.vehicleId}>
                        <TableCell className="font-medium">{v.plateNumber}</TableCell>
                        <TableCell>
                          <Badge variant={v.ownershipType === 'FACTORY' ? 'default' : 'secondary'}>
                            {OWNERSHIP_LABELS[v.ownershipType] || v.ownershipType}
                          </Badge>
                        </TableCell>
                        <TableCell>{v.driverName || '-'}</TableCell>
                        <TableCell className="text-center">{v.totalDeliveries}</TableCell>
                        <TableCell className="text-right text-red-600">{formatRupiah(v.totalCost)}</TableCell>
                        <TableCell className="text-right text-green-600">{formatRupiah(v.totalCharge)}</TableCell>
                        <TableCell className={`text-right font-medium ${v.totalMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatRupiah(v.totalMargin)}
                        </TableCell>
                        <TableCell className="text-right">{formatRupiah(v.avgCostPerDelivery)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!isLoading && report && activeTab === 'byMonth' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Trend Per Bulan</CardTitle>
          </CardHeader>
          <CardContent>
            {summary && summary.byMonth.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">Belum ada data.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bulan</TableHead>
                      <TableHead className="text-center"># Kirim</TableHead>
                      <TableHead className="text-right">Biaya Oper.</TableHead>
                      <TableHead className="text-right">Charge</TableHead>
                      <TableHead className="text-right">Margin</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary?.byMonth.map((m) => (
                      <TableRow key={m.month}>
                        <TableCell className="font-medium">{formatMonth(m.month)}</TableCell>
                        <TableCell className="text-center">{m.totalDeliveries}</TableCell>
                        <TableCell className="text-right text-red-600">{formatRupiah(m.totalCost)}</TableCell>
                        <TableCell className="text-right text-green-600">{formatRupiah(m.totalCharge)}</TableCell>
                        <TableCell className={`text-right font-medium ${m.totalMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatRupiah(m.totalMargin)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!isLoading && report && activeTab === 'detail' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Detail Pengiriman</CardTitle>
          </CardHeader>
          <CardContent>
            {report.deliveries.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">Belum ada data pengiriman.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>No. DO</TableHead>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>Armada</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Alamat Tujuan</TableHead>
                      <TableHead className="text-right">Berat (Kg)</TableHead>
                      <TableHead className="text-right">Biaya Oper.</TableHead>
                      <TableHead className="text-right">Charge</TableHead>
                      <TableHead className="text-right">Margin</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.deliveries.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="font-medium">{d.orderNumber}</TableCell>
                        <TableCell>{new Date(d.deliveryDate).toLocaleDateString('id-ID')}</TableCell>
                        <TableCell>{d.vehicle?.plateNumber || '-'}</TableCell>
                        <TableCell>{d.salesOrder?.customer?.name || '-'}</TableCell>
                        <TableCell className="max-w-[180px] truncate" title={d.destinationAddress || ''}>{d.destinationAddress || '-'}</TableCell>
                        <TableCell className="text-right">{d.estimatedWeightKg ?? '-'}</TableCell>
                        <TableCell className="text-right text-red-600">{formatRupiah(d.totalCost)}</TableCell>
                        <TableCell className="text-right text-green-600">{formatRupiah(d.totalCharge)}</TableCell>
                        <TableCell className={`text-right font-medium ${(d.totalCharge - d.totalCost) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatRupiah(d.totalCharge - d.totalCost)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}