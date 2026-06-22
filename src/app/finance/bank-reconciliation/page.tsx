"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  UploadCloud,
  CheckCircle,
  AlertCircle,
  Loader2,
  FileSpreadsheet,
} from "lucide-react";
import {
  autoMatchReconciliation,
  confirmReconciliation,
} from "@/actions/finance/reconciliation-actions";
import { getChartOfAccounts } from "@/actions/finance/accounting";
import { formatRupiah } from "@/lib/utils/utils";
import { toast } from "sonner";

interface BankStatementRow {
  id: string;
  date: Date;
  description: string;
  amount: number;
}

interface MatchResult {
  statementRow: BankStatementRow;
  matchedJournalLineId?: string;
  confidence: number;
  candidates: Record<string, unknown>[];
}

interface BankAccount {
  id: string;
  code: string;
  name: string;
  isCashAccount?: boolean;
  category?: string;
}

function parseBankStatementCsv(text: string): BankStatementRow[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];

  // Detect separator: comma or semicolon
  const separator = lines[0].includes(";") ? ";" : ",";
  const headers = lines[0]
    .split(separator)
    .map((h) => h.trim().toLowerCase().replace(/['"]/g, ""));

  // Try to find column indices
  const dateIdx = headers.findIndex(
    (h) => h.includes("tanggal") || h === "date" || h === "tgl",
  );
  const descIdx = headers.findIndex(
    (h) =>
      h.includes("keterangan") ||
      h.includes("description") ||
      h.includes("deskripsi") ||
      h === "narasi" ||
      h === "memo",
  );
  const debitIdx = headers.findIndex(
    (h) => h.includes("debit") || h.includes("db") || h === "debet",
  );
  const creditIdx = headers.findIndex(
    (h) => h.includes("credit") || h.includes("cr") || h === "kredit",
  );
  const amountIdx = headers.findIndex(
    (h) => h === "amount" || h === "jumlah" || h === "nominal",
  );

  if (dateIdx === -1) return []; // Need at least a date column

  const rows: BankStatementRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i]
      .split(separator)
      .map((c) => c.trim().replace(/['"]/g, ""));
    if (cols.length < 2) continue;

    const dateStr = cols[dateIdx];
    if (!dateStr) continue;

    // Parse date (support DD/MM/YYYY, YYYY-MM-DD, DD-MM-YYYY)
    let date: Date;
    if (dateStr.includes("/")) {
      const parts = dateStr.split("/");
      if (parts[0].length === 4) {
        date = new Date(`${parts[0]}-${parts[1]}-${parts[2]}`);
      } else {
        date = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
      }
    } else {
      date = new Date(dateStr);
    }
    if (isNaN(date.getTime())) continue;

    const description = descIdx >= 0 ? cols[descIdx] : `Transaksi baris ${i}`;

    let amount = 0;
    if (debitIdx >= 0 && creditIdx >= 0) {
      // Separate debit/credit columns
      const debit =
        parseFloat(
          (cols[debitIdx] || "0").replace(/[^0-9.,-]/g, "").replace(",", "."),
        ) || 0;
      const credit =
        parseFloat(
          (cols[creditIdx] || "0").replace(/[^0-9.,-]/g, "").replace(",", "."),
        ) || 0;
      amount = debit - credit; // positive = inflow, negative = outflow
    } else if (amountIdx >= 0) {
      amount =
        parseFloat(
          (cols[amountIdx] || "0").replace(/[^0-9.,-]/g, "").replace(",", "."),
        ) || 0;
    }

    if (amount !== 0) {
      rows.push({
        id: `S${i}`,
        date,
        description,
        amount,
      });
    }
  }
  return rows;
}

export default function BankReconciliationPage() {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [results, setResults] = useState<MatchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [parsedRows, setParsedRows] = useState<BankStatementRow[]>([]);

  useEffect(() => {
    getChartOfAccounts().then((res: Record<string, unknown>) => {
      if (res.success) {
        const accData = res.data as BankAccount[];
        setAccounts(
          accData.filter((a) => a.isCashAccount || a.category === "CASH"),
        );
      }
    });
  }, []);

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        const rows = parseBankStatementCsv(text);
        if (rows.length === 0) {
          toast.error(
            "Tidak dapat membaca file CSV. Pastikan kolom: tanggal, keterangan, jumlah/debit+credit",
          );
          setParsedRows([]);
        } else {
          setParsedRows(rows);
          toast.success(`${rows.length} baris transaksi ditemukan`);
        }
      };
      reader.readAsText(file);
    },
    [],
  );

  const handleAutoMatch = async () => {
    if (!selectedAccount || !startDate || !endDate) {
      toast.error("Pilih akun bank dan periode terlebih dahulu");
      return;
    }
    if (parsedRows.length === 0) {
      toast.error("Upload file bank statement terlebih dahulu");
      return;
    }

    setLoading(true);
    try {
      const res = await autoMatchReconciliation(
        selectedAccount,
        new Date(startDate),
        new Date(endDate),
        parsedRows,
      );
      if (res && "success" in res && res.success) {
        setResults(res.data as unknown as MatchResult[]);
        const matched = (res.data as unknown as MatchResult[]).filter(
          (r) => r.confidence === 100,
        ).length;
        toast.success(
          `${matched} dari ${(res.data as unknown as MatchResult[]).length} baris cocok otomatis`,
        );
      } else {
        toast.error(
          res && "error" in res
            ? (res.error as string)
            : "Gagal menjalankan auto match",
        );
      }
    } catch (error) {
      console.error(error);
      toast.error("Terjadi kesalahan");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    const matchedIds = results
      .filter((r) => r.confidence === 100 && r.matchedJournalLineId)
      .map((r) => r.matchedJournalLineId as string);

    if (matchedIds.length === 0) {
      toast.error("Tidak ada baris yang cocok untuk dikonfirmasi");
      return;
    }

    setConfirming(true);
    try {
      const res = await confirmReconciliation(matchedIds);
      if (res && "success" in res && res.success) {
        const data = res.data as { message: string };
        toast.success(data.message);
        setResults([]);
        setParsedRows([]);
      } else {
        toast.error(
          res && "error" in res
            ? (res.error as string)
            : "Gagal mengkonfirmasi",
        );
      }
    } catch {
      toast.error("Terjadi kesalahan");
    } finally {
      setConfirming(false);
    }
  };

  const matchedCount = results.filter((r) => r.confidence === 100).length;
  const unmatchedCount = results.filter((r) => r.confidence < 100).length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Rekonsiliasi Bank</h1>
        <p className="text-muted-foreground">
          Cocokkan mutasi bank dengan jurnal umum
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Parameter Rekonsiliasi</CardTitle>
          <CardDescription>
            Pilih akun bank, periode, dan upload file mutasi bank (CSV)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Akun Bank</Label>
              <Select
                value={selectedAccount}
                onValueChange={setSelectedAccount}
              >
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
            <div className="space-y-2">
              <Label>Tanggal Mulai</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Tanggal Akhir</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>File Mutasi Bank (CSV)</Label>
            <div className="flex items-center gap-3">
              <Input
                type="file"
                accept=".csv,.txt"
                onChange={handleFileUpload}
                className="flex-1"
              />
              {parsedRows.length > 0 && (
                <span className="text-sm text-emerald-600 flex items-center gap-1">
                  <FileSpreadsheet className="h-4 w-4" />
                  {parsedRows.length} baris
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Format CSV: kolom tanggal, keterangan, jumlah (atau debit + credit
              terpisah)
            </p>
          </div>

          <div className="pt-4 flex justify-end">
            <Button
              onClick={handleAutoMatch}
              disabled={loading || parsedRows.length === 0}
              className="gap-2"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UploadCloud className="h-4 w-4" />
              )}
              Auto Match
            </Button>
          </div>
        </CardContent>
      </Card>

      {results.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle>Hasil Rekonsiliasi</CardTitle>
                <CardDescription>
                  Review hasil pencocokan dan konfirmasi
                </CardDescription>
              </div>
              <div className="flex gap-3 text-sm">
                <span className="flex items-center gap-1 text-emerald-600">
                  <CheckCircle className="h-4 w-4" /> {matchedCount} cocok
                </span>
                <span className="flex items-center gap-1 text-amber-600">
                  <AlertCircle className="h-4 w-4" /> {unmatchedCount} belum
                  cocok
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/20 text-muted-foreground">
                    <th className="h-10 px-4 text-left font-medium">Tanggal</th>
                    <th className="h-10 px-4 text-left font-medium">
                      Keterangan
                    </th>
                    <th className="h-10 px-4 text-right font-medium">Jumlah</th>
                    <th className="h-10 px-4 text-left font-medium">Status</th>
                    <th className="h-10 px-4 text-left font-medium">
                      Jurnal Cocok
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => (
                    <tr key={i} className="border-b hover:bg-muted/50">
                      <td className="p-4 whitespace-nowrap">
                        {new Date(r.statementRow.date).toLocaleDateString(
                          "id-ID",
                        )}
                      </td>
                      <td className="p-4">{r.statementRow.description}</td>
                      <td className="p-4 text-right font-mono">
                        {formatRupiah(r.statementRow.amount)}
                      </td>
                      <td className="p-4">
                        {r.confidence === 100 ? (
                          <span className="inline-flex items-center gap-1.5 text-emerald-600 font-medium bg-emerald-50 px-2 py-1 rounded text-xs">
                            <CheckCircle className="h-3.5 w-3.5" /> Cocok
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-amber-600 font-medium bg-amber-50 px-2 py-1 rounded text-xs">
                            <AlertCircle className="h-3.5 w-3.5" /> Belum Cocok
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-xs text-muted-foreground">
                        {r.matchedJournalLineId
                          ? `ID: ${r.matchedJournalLineId.slice(0, 8)}...`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {matchedCount > 0 && (
              <div className="mt-4 flex justify-end">
                <Button
                  onClick={handleConfirm}
                  disabled={confirming}
                  className="gap-2"
                >
                  {confirming ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle className="h-4 w-4" />
                  )}
                  Konfirmasi Rekonsiliasi ({matchedCount} baris)
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
