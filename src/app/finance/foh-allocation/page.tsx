"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  getFOHAllocation,
  getExpenseAccounts,
} from "@/actions/finance/foh-actions";
import { formatRupiah } from "@/lib/utils/utils";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

interface Account {
  id: string;
  code: string;
  name: string;
}

interface AllocationResult {
  totalOverhead: number;
  totalQuantity: number;
  allocations: Array<{
    orderNumber: string;
    actualQuantity: number;
    allocationRatio: number;
    allocatedOverhead: number;
  }>;
}

export default function FOHAllocationPage() {
  const [data, setData] = useState<AllocationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>("");

  useEffect(() => {
    getExpenseAccounts()
      .then((res) => {
        if (res.success && res.data) {
          const accountsData = res.data as Account[];
          setAccounts(accountsData);
          if (accountsData.length > 0) {
            setSelectedAccount(accountsData[0].id);
          }
        }
      })
      .catch((err) => {
        console.error("Gagal memuat akun beban:", err);
      });
  }, []);

  useEffect(() => {
    if (!selectedAccount) return;

    let isMounted = true;
    const fetchAllocation = async () => {
      setLoading(true);
      try {
        const res = await getFOHAllocation(year, month, selectedAccount);
        if (isMounted) {
          if (res.success) setData(res.data as AllocationResult);
        }
      } catch (err) {
        console.error("Gagal memuat alokasi FOH:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchAllocation();

    return () => {
      isMounted = false;
    };
  }, [year, month, selectedAccount]);

  const handleMonthChange = (val: string) => {
    const n = parseInt(val);
    if (!isNaN(n) && n >= 1 && n <= 12) setMonth(n);
  };

  const handleYearChange = (val: string) => {
    const n = parseInt(val);
    if (!isNaN(n) && n >= 2000 && n <= 2100) setYear(n);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Alokasi FOH</h1>
          <p className="text-muted-foreground">
            Distribusikan biaya overhead ke order produksi berdasarkan jumlah
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Konfigurasi</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-4 items-end">
          <div className="space-y-2 flex-1">
            <label className="text-sm font-medium">Akun Overhead</label>
            <Select value={selectedAccount} onValueChange={setSelectedAccount}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih Akun" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((acc) => (
                  <SelectItem key={acc.id} value={acc.id}>
                    {acc.code} - {acc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 w-32">
            <label className="text-sm font-medium">Bulan</label>
            <Input
              type="number"
              value={month}
              onChange={(e) => handleMonthChange(e.target.value)}
              min={1}
              max={12}
            />
          </div>
          <div className="space-y-2 w-32">
            <label className="text-sm font-medium">Tahun</label>
            <Input
              type="number"
              value={year}
              onChange={(e) => handleYearChange(e.target.value)}
              min={2000}
              max={2100}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Hasil Alokasi</CardTitle>
          <CardDescription>
            Total Overhead:{" "}
            <strong>{data ? formatRupiah(data.totalOverhead) : "-"}</strong> |
            Total Unit Diproduksi:{" "}
            <strong>
              {data ? data.totalQuantity.toLocaleString("id-ID") : "-"}
            </strong>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-muted-foreground flex justify-center items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Menghitung alokasi...
            </div>
          ) : !data || data.allocations.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              Tidak ada order produksi selesai untuk periode ini.
            </div>
          ) : (
            <div className="relative w-full overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/20 text-muted-foreground">
                    <th className="h-10 px-4 text-left font-medium">
                      Order Produksi
                    </th>
                    <th className="h-10 px-4 text-right font-medium">
                      Qty Aktual
                    </th>
                    <th className="h-10 px-4 text-right font-medium">
                      % Rasio
                    </th>
                    <th className="h-10 px-4 text-right font-medium">
                      Overhead Dialokasi
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.allocations.map((row, i: number) => (
                    <tr
                      key={i}
                      className="border-b transition-colors hover:bg-muted/50"
                    >
                      <td className="p-4 align-middle font-medium font-mono">
                        {row.orderNumber}
                      </td>
                      <td className="p-4 align-middle font-mono text-right">
                        {row.actualQuantity.toLocaleString("id-ID")}
                      </td>
                      <td className="p-4 align-middle font-mono text-right">
                        {(row.allocationRatio * 100).toFixed(2)}%
                      </td>
                      <td className="p-4 align-middle font-mono text-right font-bold text-foreground">
                        {formatRupiah(row.allocatedOverhead)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
