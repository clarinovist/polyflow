'use client';

import { useEffect, useState } from 'react';
import { getBpjsRecap } from '@/actions/hrd/bpjs-recap';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download } from 'lucide-react';
import { toast } from 'sonner';

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

function formatIdr(n: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
}

type Row = {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  payType: string;
  status: string;
  bpjsKesehatanNo: string | null;
  bpjsKetenagakerjaanNo: string | null;
  employeeDeductionMaster: number;
  employerCostMaster: number;
  actualDeducted: number;
  source: string;
};

export function BpjsRecap() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [totals, setTotals] = useState({
    participants: 0,
    sumEmployeeDeductionMaster: 0,
    sumEmployerCostMaster: 0,
    sumActualDeducted: 0,
  });
  const [weekLabel, setWeekLabel] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await getBpjsRecap(year, month);
      if (res.success && res.data) {
        setRows(res.data.rows);
        setTotals(res.data.totals);
        const opts: Intl.DateTimeFormatOptions = {
          day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
        };
        setWeekLabel(
          `${new Date(res.data.bpjsWeekStart).toLocaleDateString('id-ID', opts)} – ${new Date(res.data.bpjsWeekEnd).toLocaleDateString('id-ID', opts)}`,
        );
      } else {
        const err = res as { success: false; error: string };
        toast.error(err.error || 'Gagal memuat rekap BPJS');
        setRows([]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Rekap BPJS</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Peserta & iuran master · potongan real dari gaji · minggu potong shopfloor: {weekLabel || '—'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONTH_NAMES.map((name, i) => (
                <SelectItem key={name} value={String(i + 1)}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-[100px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[2025, 2026, 2027].map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <a href={`/api/hrd/bpjs/export?year=${year}&month=${month}`}>
            <Button type="button" size="sm" variant="outline" className="gap-1 h-9">
              <Download className="h-4 w-4" /> CSV
            </Button>
          </a>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border bg-card p-3">
          <div className="text-[10px] uppercase text-muted-foreground font-medium">Peserta</div>
          <div className="text-lg font-bold">{totals.participants}</div>
        </div>
        <div className="rounded-xl border bg-card p-3">
          <div className="text-[10px] uppercase text-muted-foreground font-medium">Iuran Karyawan</div>
          <div className="text-lg font-bold">{formatIdr(totals.sumEmployeeDeductionMaster)}</div>
        </div>
        <div className="rounded-xl border bg-card p-3">
          <div className="text-[10px] uppercase text-muted-foreground font-medium">Iuran Perusahaan</div>
          <div className="text-lg font-bold">{formatIdr(totals.sumEmployerCostMaster)}</div>
        </div>
        <div className="rounded-xl border bg-card p-3">
          <div className="text-[10px] uppercase text-muted-foreground font-medium">Terpotong di Gaji</div>
          <div className="text-lg font-bold text-rose-700">{formatIdr(totals.sumActualDeducted)}</div>
        </div>
      </div>

      <div className="rounded-xl border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left">
            <tr>
              <th className="p-3">Kode</th>
              <th className="p-3">Nama</th>
              <th className="p-3">Basis</th>
              <th className="p-3">No Kes</th>
              <th className="p-3">No Ket</th>
              <th className="p-3 text-right">Iuran Kar</th>
              <th className="p-3 text-right">Iuran Perush</th>
              <th className="p-3 text-right">Potong Real</th>
              <th className="p-3">Sumber</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">Memuat…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">Tidak ada peserta BPJS</td></tr>
            )}
            {!loading && rows.map((r) => (
              <tr key={r.employeeId} className="border-t">
                <td className="p-3 font-mono text-xs">{r.employeeCode}</td>
                <td className="p-3">
                  {r.employeeName}
                  {r.status !== 'ACTIVE' && (
                    <span className="ml-1 text-[10px] text-muted-foreground">({r.status})</span>
                  )}
                </td>
                <td className="p-3 text-xs">
                  {r.payType === 'PIECE' ? 'Borongan' : r.payType === 'MONTHLY' ? 'Bulanan' : 'Harian'}
                </td>
                <td className="p-3 text-xs font-mono">{r.bpjsKesehatanNo || '—'}</td>
                <td className="p-3 text-xs font-mono">{r.bpjsKetenagakerjaanNo || '—'}</td>
                <td className="p-3 text-right">{formatIdr(r.employeeDeductionMaster)}</td>
                <td className="p-3 text-right">{formatIdr(r.employerCostMaster)}</td>
                <td className="p-3 text-right">
                  {r.actualDeducted > 0 ? (
                    <span className="text-rose-700 font-medium">-{formatIdr(r.actualDeducted)}</span>
                  ) : (
                    <span className="text-amber-700 text-xs">belum potong</span>
                  )}
                </td>
                <td className="p-3 text-xs text-muted-foreground">
                  {r.source === 'WEEKLY_LAST' ? 'Minggu akhir' : r.source === 'MONTHLY_SLIP' ? 'Slip bulanan' : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Iuran master dari data karyawan. Shopfloor (harian/borongan): potongan real = iuran karyawan di minggu yang memuat akhir bulan.
        Kantor (bulanan): potongan real dari slip yang sudah di-generate. Belum potong = slip belum ada / iuran 0.
      </p>
    </div>
  );
}
