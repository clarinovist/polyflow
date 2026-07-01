"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { getAgingSummary } from "@/actions/finance/aging-actions";
import { formatRupiah } from "@/lib/utils/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

interface AgingRow {
  partnerName: string;
  notYetDue: number;
  current: number;
  days31to60: number;
  days61to90: number;
  over90: number;
  total: number;
}

const AgingTable = ({
  data,
  loading,
  title,
  description,
  partnerNameHeader,
}: {
  data: AgingRow[];
  loading: boolean;
  title: string;
  description: string;
  partnerNameHeader: string;
}) => (
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
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr
                  key={i}
                  className="border-b transition-colors hover:bg-muted/50"
                >
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
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 font-bold bg-muted/30">
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
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </CardContent>
  </Card>
);

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
          Pantau piutang dan hutang yang belum jatuh tempo
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
            description="Saldo outstanding dari Customer"
            partnerNameHeader="Customer"
          />
        </TabsContent>

        <TabsContent value="ap">
          <AgingTable
            data={filteredAP}
            loading={loadingAP}
            title="Aging Hutang"
            description="Saldo outstanding ke Supplier"
            partnerNameHeader="Supplier"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
