"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { getAgingSummary } from "@//actions/finance/aging-actions";
import { formatRupiah } from "@/lib/utils/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Search, ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

interface AgingInvoiceDetail {
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string | null;
  daysOverdue: number;
  outstanding: number;
  status: string;
  bucket: 'notYetDue' | '1-30' | '31-60' | '61-90' | '90+';
}

interface AgingRow {
  partnerId: string;
  partnerName: string;
  type: 'AR' | 'AP';
  notYetDue: number;
  current: number;
  days31to60: number;
  days61to90: number;
  over90: number;
  total: number;
  invoices: AgingInvoiceDetail[];
}

function getBucketColor(bucket: AgingInvoiceDetail['bucket']): string {
  switch (bucket) {
    case 'notYetDue': return 'text-emerald-600';
    case '1-30': return '';
    case '31-60': return 'text-amber-600';
    case '61-90': return 'text-orange-600';
    case '90+': return 'text-rose-600 font-bold';
    default: return '';
  }
}

function getBucketLabel(bucket: AgingInvoiceDetail['bucket']): string {
  switch (bucket) {
    case 'notYetDue': return 'Belum Jatuh Tempo';
    case '1-30': return '1-30 Hari';
    case '31-60': return '31-60 Hari';
    case '61-90': return '61-90 Hari';
    case '90+': return '> 90 Hari';
    default: return '';
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'UNPAID':
      return <Badge variant="outline" className="text-amber-600 border-amber-300">Belum Bayar</Badge>;
    case 'PARTIAL':
      return <Badge variant="outline" className="text-blue-600 border-blue-300">Sebagian</Badge>;
    case 'OVERDUE':
      return <Badge variant="destructive">Jatuh Tempo</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

const InvoiceDetailTable = ({ invoices, type }: { invoices: AgingInvoiceDetail[]; type: 'AR' | 'AP' }) => {
  const sorted = [...invoices].sort((a, b) => a.daysOverdue - b.daysOverdue);

  return (
    <div className="mx-4 mb-4 overflow-hidden rounded-lg border border-border/50 bg-muted/10">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/30 text-muted-foreground">
            <th className="h-9 px-4 text-left font-medium">No. Nota</th>
            <th className="h-9 px-4 text-left font-medium">Tanggal</th>
            <th className="h-9 px-4 text-left font-medium">Jatuh Tempo</th>
            <th className="h-9 px-4 text-right font-medium">Hari Overdue</th>
            <th className="h-9 px-4 text-right font-medium">Outstanding</th>
            <th className="h-9 px-4 text-center font-medium">Status</th>
            <th className="h-9 px-4 text-center font-medium">Aging</th>
            <th className="h-9 px-4 text-center font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((inv) => (
            <tr key={inv.invoiceId} className="border-t border-border/30 hover:bg-muted/20">
              <td className="px-4 py-2.5 font-medium">{inv.invoiceNumber}</td>
              <td className="px-4 py-2.5">
                {new Date(inv.invoiceDate).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
              </td>
              <td className="px-4 py-2.5">
                {inv.dueDate
                  ? new Date(inv.dueDate).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
                  : <span className="text-muted-foreground">-</span>
                }
              </td>
              <td className={`px-4 py-2.5 text-right font-mono ${getBucketColor(inv.bucket)}`}>
                {inv.daysOverdue < 0 ? `${Math.abs(inv.daysOverdue)} hari lagi` : `${inv.daysOverdue} hari`}
              </td>
              <td className="px-4 py-2.5 text-right font-mono font-medium">
                {formatRupiah(inv.outstanding)}
              </td>
              <td className="px-4 py-2.5 text-center">
                {getStatusBadge(inv.status)}
              </td>
              <td className="px-4 py-2.5 text-center">
                <span className={`text-xs ${getBucketColor(inv.bucket)}`}>
                  {getBucketLabel(inv.bucket)}
                </span>
              </td>
              <td className="px-4 py-2.5 text-center">
                <Link
                  href={type === 'AR' ? `/sales/invoices/${inv.invoiceId}` : `/purchasing/invoices/${inv.invoiceId}`}
                  className="inline-flex items-center gap-1 text-primary hover:underline text-xs"
                >
                  Detail <ExternalLink className="h-3 w-3" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const AgingTable = ({
  data,
  loading,
  title,
  description,
  partnerNameHeader,
  type,
}: {
  data: AgingRow[];
  loading: boolean;
  title: string;
  description: string;
  partnerNameHeader: string;
  type: 'AR' | 'AP';
}) => {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = (partnerId: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(partnerId)) {
        next.delete(partnerId);
      } else {
        next.add(partnerId);
      }
      return next;
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="py-8 text-center text-muted-foreground flex justify-center items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Memuat data aging...
          </div>
        ) : data.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            Tidak ada saldo outstanding ditemukan.
          </div>
        ) : (
          <div className="relative w-full overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/20 text-muted-foreground">
                  <th className="h-10 px-4 text-left font-medium w-8"></th>
                  <th className="h-10 px-4 text-left font-medium">
                    {partnerNameHeader}
                  </th>
                  <th className="h-10 px-4 text-right font-medium text-emerald-600">Belum Jatuh Tempo</th>
                  <th className="h-10 px-4 text-right font-medium">1-30 Hari</th>
                  <th className="h-10 px-4 text-right font-medium">31-60 Hari</th>
                  <th className="h-10 px-4 text-right font-medium">61-90 Hari</th>
                  <th className="h-10 px-4 text-right font-medium">
                    &gt; 90 Hari
                  </th>
                  <th className="h-10 px-4 text-right font-bold text-foreground">
                    Total
                  </th>
                  <th className="h-10 px-4 text-center font-medium text-muted-foreground">
                    Jml Nota
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.map((row) => (
                  <>
                    <tr
                      key={row.partnerId}
                      className="border-b transition-colors hover:bg-muted/50 cursor-pointer"
                      onClick={() => toggleRow(row.partnerId)}
                    >
                      <td className="p-4 align-middle">
                        {expandedRows.has(row.partnerId) ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </td>
                      <td className="p-4 align-middle font-medium">
                        {row.partnerName}
                      </td>
                      <td className="p-4 align-middle text-right font-mono text-emerald-600">
                        {formatRupiah(row.notYetDue)}
                      </td>
                      <td className="p-4 align-middle text-right font-mono">
                        {formatRupiah(row.current)}
                      </td>
                      <td className="p-4 align-middle text-right font-mono">
                        {formatRupiah(row.days31to60)}
                      </td>
                      <td className="p-4 align-middle text-right font-mono text-amber-600">
                        {formatRupiah(row.days61to90)}
                      </td>
                      <td className="p-4 align-middle text-right font-mono text-rose-600 font-bold">
                        {formatRupiah(row.over90)}
                      </td>
                      <td className="p-4 align-middle text-right font-mono font-bold text-foreground bg-muted/10">
                        {formatRupiah(row.total)}
                      </td>
                      <td className="p-4 align-middle text-center text-muted-foreground">
                        {row.invoices.length}
                      </td>
                    </tr>
                    {expandedRows.has(row.partnerId) && (
                      <tr key={`${row.partnerId}-detail`}>
                        <td colSpan={9} className="p-0">
                          <InvoiceDetailTable invoices={row.invoices} type={type} />
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 font-bold bg-muted/30">
                  <td className="p-4 align-middle"></td>
                  <td className="p-4 align-middle text-left">Grand Total</td>
                  <td className="p-4 align-middle text-right font-mono text-emerald-600">
                    {formatRupiah(
                      data.reduce((sum, row) => sum + row.notYetDue, 0),
                    )}
                  </td>
                  <td className="p-4 align-middle text-right font-mono">
                    {formatRupiah(
                      data.reduce((sum, row) => sum + row.current, 0),
                    )}
                  </td>
                  <td className="p-4 align-middle text-right font-mono">
                    {formatRupiah(
                      data.reduce((sum, row) => sum + row.days31to60, 0),
                    )}
                  </td>
                  <td className="p-4 align-middle text-right font-mono text-amber-600">
                    {formatRupiah(
                      data.reduce((sum, row) => sum + row.days61to90, 0),
                    )}
                  </td>
                  <td className="p-4 align-middle text-right font-mono text-rose-600">
                    {formatRupiah(data.reduce((sum, row) => sum + row.over90, 0))}
                  </td>
                  <td className="p-4 align-middle text-right font-mono bg-muted/10">
                    {formatRupiah(data.reduce((sum, row) => sum + row.total, 0))}
                  </td>
                  <td className="p-4 align-middle text-center text-muted-foreground">
                    {data.reduce((sum, row) => sum + row.invoices.length, 0)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default function AgingPage() {
  const [arData, setArData] = useState<AgingRow[]>([]);
  const [apData, setApData] = useState<AgingRow[]>([]);
  const [loadingAR, setLoadingAR] = useState(true);
  const [loadingAP, setLoadingAP] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const filteredAR = useMemo(() => {
    return arData.filter((row) =>
      row.partnerName.toLowerCase().includes(searchTerm.toLowerCase()),
    );
  }, [arData, searchTerm]);

  const filteredAP = useMemo(() => {
    return apData.filter((row) =>
      row.partnerName.toLowerCase().includes(searchTerm.toLowerCase()),
    );
  }, [apData, searchTerm]);

  useEffect(() => {
    getAgingSummary("AR")
      .then((res) => {
        if (res.success) setArData(res.data as AgingRow[]);
        setLoadingAR(false);
      })
      .catch((err) => {
        console.error("Gagal memuat AR aging:", err);
        setLoadingAR(false);
      });
    getAgingSummary("AP")
      .then((res) => {
        if (res.success) setApData(res.data as AgingRow[]);
        setLoadingAP(false);
      })
      .catch((err) => {
        console.error("Gagal memuat AP aging:", err);
        setLoadingAP(false);
      });
  }, []);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Aging AR/AP</h1>
        <p className="text-muted-foreground">
          Pantau piutang dan hutang per nota. Klik baris untuk melihat detail.
        </p>
      </div>

      <Tabs defaultValue="ar" className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <TabsList>
            <TabsTrigger value="ar">Piutang (AR)</TabsTrigger>
            <TabsTrigger value="ap">Hutang (AP)</TabsTrigger>
          </TabsList>
          <div className="relative max-w-sm w-full sm:w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cari nama mitra..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <TabsContent value="ar">
          <AgingTable
            data={filteredAR}
            loading={loadingAR}
            title="Aging Piutang"
            description="Saldo outstanding dari Customer. Klik baris untuk detail nota."
            partnerNameHeader="Customer"
            type="AR"
          />
        </TabsContent>

        <TabsContent value="ap">
          <AgingTable
            data={filteredAP}
            loading={loadingAP}
            title="Aging Hutang"
            description="Saldo outstanding ke Supplier. Klik baris untuk detail nota."
            partnerNameHeader="Supplier"
            type="AP"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
