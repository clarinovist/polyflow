"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
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
  Plus,
  History,
  Eye,
  ArrowLeft,
} from "lucide-react";
import {
  autoMatchReconciliation,
  confirmReconciliation,
  listReconciliations,
  createReconciliation,
} from "@/actions/finance/reconciliation-actions";
import { getChartOfAccounts } from "@/actions/finance/accounting";
import { formatRupiah } from "@/lib/utils/utils";
import { toast } from "sonner";

// ── Types ──

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

interface ReconciliationRecord {
  id: string;
  accountId: string;
  periodStart: string;
  periodEnd: string;
  bankBalance: number;
  bookBalance: number;
  status: "DRAFT" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  createdAt: string;
  account: { code: string; name: string };
  createdBy: { name: string };
  _count: { items: number; adjustments: number };
}

// ── CSV Parser ──

function parseBankStatementCsv(text: string): BankStatementRow[] {
  const lines = text.trim().split("\n");
  if (lines.length < 1) return [];

  const separator = lines[0].includes(";") ? ";" : ",";
  const firstLineCols = lines[0]
    .split(separator)
    .map((h) => h.trim().toLowerCase().replace(/['"]/g, ""));

  // Check if first row is a header or data
  const isHeader =
    firstLineCols.some(
      (h) =>
        h.includes("tanggal") ||
        h === "date" ||
        h === "tgl" ||
        h.includes("keterangan") ||
        h.includes("description") ||
        h.includes("narasi") ||
        h === "memo",
    ) || lines.length < 2;

  const headerRow = isHeader ? firstLineCols : [];
  const dataStartIdx = isHeader ? 1 : 0;

  // Header-based column detection
  const dateIdx = headerRow.findIndex(
    (h) => h.includes("tanggal") || h === "date" || h === "tgl",
  );
  const descIdx = headerRow.findIndex(
    (h) =>
      h.includes("keterangan") ||
      h.includes("description") ||
      h.includes("deskripsi") ||
      h === "narasi" ||
      h === "memo",
  );
  const debitIdx = headerRow.findIndex(
    (h) => h.includes("debit") || h.includes("db") || h === "debet",
  );
  const creditIdx = headerRow.findIndex(
    (h) => h.includes("credit") || h.includes("cr") || h === "kredit",
  );
  const amountIdx = headerRow.findIndex(
    (h) => h === "amount" || h === "jumlah" || h === "nominal",
  );
  const dbCrIdx = headerRow.findIndex(
    (h) =>
      h.includes("db/cr") ||
      h.includes("dbcr") ||
      h.includes("d/c") ||
      h === "type",
  );

  // For headerless CSV: assume positional columns
  // BCA Corporate: Tanggal(0), Keterangan(1), Cabang(2), Jumlah(3), DB/CR(4), Saldo(5)
  const resolvedDateIdx = dateIdx >= 0 ? dateIdx : 0;
  const resolvedDescIdx = descIdx >= 0 ? descIdx : 1;
  const resolvedAmountIdx = amountIdx >= 0 ? amountIdx : 3;
  const resolvedDbCrIdx = dbCrIdx >= 0 ? dbCrIdx : 4;

  const rows: BankStatementRow[] = [];
  for (let i = dataStartIdx; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = line
      .split(separator)
      .map((c) => c.trim().replace(/['"]/g, ""));
    if (cols.length < 2) continue;

    const dateStr = cols[resolvedDateIdx];
    if (!dateStr) continue;

    let date: Date;
    if (dateStr.includes("/")) {
      const parts = dateStr.split("/");
      if (parts[0].length === 4) {
        date = new Date(`${parts[0]}-${parts[1]}-${parts[2]}`);
      } else if (parts[2]?.length === 4) {
        date = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
      } else {
        // MM/DD/YY or DD/MM/YY — assume DD/MM/YY
        date = new Date(`20${parts[2]}-${parts[1]}-${parts[0]}`);
      }
    } else if (dateStr.includes("-")) {
      date = new Date(dateStr);
    } else {
      continue;
    }
    if (isNaN(date.getTime())) continue;

    const description =
      cols[resolvedDescIdx] || `Transaksi baris ${i}`;

    let amount = 0;
    if (debitIdx >= 0 && creditIdx >= 0) {
      // Separate debit/credit columns
      const debit = parseFloat(cols[debitIdx]?.replace(/[.,]/g, "")) || 0;
      const credit = parseFloat(cols[creditIdx]?.replace(/[.,]/g, "")) || 0;
      amount = debit > 0 ? debit : -credit;
    } else {
      // Single amount column
      const rawAmount =
        parseFloat(cols[resolvedAmountIdx]?.replace(/[.,]/g, "")) || 0;
      // Check DB/CR indicator
      const dbCr = (cols[resolvedDbCrIdx] || "").toUpperCase();
      if (dbCr === "DB" || dbCr === "DEBET" || dbCr === "D") {
        amount = -Math.abs(rawAmount);
      } else if (dbCr === "CR" || dbCr === "CREDIT" || dbCr === "C") {
        amount = Math.abs(rawAmount);
      } else {
        // No DB/CR column — use sign of amount
        amount = rawAmount;
      }
    }

    if (amount === 0) continue;

    rows.push({ id: `S${i}`, date, description, amount });
  }

  return rows;
}

// ── Status Badge ──

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    DRAFT: "bg-gray-100 text-gray-700 border-gray-200",
    IN_PROGRESS: "bg-yellow-50 text-yellow-700 border-yellow-200",
    COMPLETED: "bg-emerald-50 text-emerald-700 border-emerald-200",
    CANCELLED: "bg-red-50 text-red-700 border-red-200",
  };
  const labels: Record<string, string> = {
    DRAFT: "Draft",
    IN_PROGRESS: "In Progress",
    COMPLETED: "Selesai",
    CANCELLED: "Dibatalkan",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${styles[status] ?? styles.DRAFT}`}
    >
      {labels[status] ?? status}
    </span>
  );
}

// ── Main Component ──

export default function BankReconciliationPage() {
  const router = useRouter();

  // History
  const [reconciliations, setReconciliations] = useState<ReconciliationRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // Create flow
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [results, setResults] = useState<MatchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [parsedRows, setParsedRows] = useState<BankStatementRow[]>([]);

  // Load history
  useEffect(() => {
    setLoadingHistory(true);
    listReconciliations()
      .then((res: Record<string, unknown>) => {
        if (res.success) {
          setReconciliations(res.data as unknown as ReconciliationRecord[]);
        }
      })
      .finally(() => setLoadingHistory(false));
  }, []);

  // Load accounts
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
      toast.error("Gagal memproses rekonsiliasi. Silakan coba lagi.");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAndContinue = async () => {
    if (!selectedAccount || !startDate || !endDate) {
      toast.error("Pilih akun bank dan periode terlebih dahulu");
      return;
    }
    if (parsedRows.length === 0) {
      toast.error("Upload file bank statement terlebih dahulu");
      return;
    }

    setSaving(true);
    try {
      const res = await createReconciliation(
        selectedAccount,
        new Date(startDate),
        new Date(endDate),
        parsedRows,
      );
      if (res && "success" in res && res.success) {
        const data = res.data as { id: string };
        toast.success("Rekonsiliasi berhasil dibuat");
        router.push(`/finance/bank-reconciliation/${data.id}`);
      } else {
        toast.error(
          res && "error" in res
            ? (res.error as string)
            : "Gagal menyimpan rekonsiliasi",
        );
      }
    } catch {
      toast.error("Gagal menyimpan rekonsiliasi. Silakan coba lagi.");
    } finally {
      setSaving(false);
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
        setShowCreateForm(false);
        // Refresh history
        setLoadingHistory(true);
        listReconciliations().then((r: Record<string, unknown>) => {
          if (r.success) setReconciliations(r.data as unknown as ReconciliationRecord[]);
        }).finally(() => setLoadingHistory(false));
      } else {
        toast.error(
          res && "error" in res
            ? (res.error as string)
            : "Gagal mengkonfirmasi",
        );
      }
    } catch {
      toast.error("Gagal memproses rekonsiliasi. Silakan coba lagi.");
    } finally {
      setConfirming(false);
    }
  };

  const matchedCount = results.filter((r) => r.confidence === 100).length;
  const unmatchedCount = results.filter((r) => r.confidence < 100).length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Rekonsiliasi Bank</h1>
          <p className="text-muted-foreground">
            Cocokkan mutasi bank dengan jurnal umum
          </p>
        </div>
        <Button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="gap-2"
        >
          {showCreateForm ? (
            <>
              <ArrowLeft className="h-4 w-4" />
              Kembali
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" />
              Rekonsiliasi Baru
            </>
          )}
        </Button>
      </div>

      {/* ── Create Form (hidden when showing history) ── */}
      {showCreateForm ? (
        <>
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
                  Format CSV: kolom tanggal, keterangan, jumlah (atau debit + credit terpisah)
                </p>
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => setShowCreateForm(false)}
                >
                  Batal
                </Button>
                {parsedRows.length > 0 && (
                  <Button
                    onClick={handleAutoMatch}
                    disabled={loading || !selectedAccount || !startDate || !endDate}
                    variant="outline"
                    className="gap-2"
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <UploadCloud className="h-4 w-4" />
                    )}
                    Auto Match
                  </Button>
                )}
                <Button
                  onClick={handleSaveAndContinue}
                  disabled={saving || !selectedAccount || !startDate || !endDate}
                  className="gap-2"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle className="h-4 w-4" />
                  )}
                  Simpan & Lanjutkan
                </Button>
                {parsedRows.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-2">
                    💡 Upload CSV opsional — bisa input mutasi bank manual di halaman detail
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* ── Match Results (inline preview) ── */}
          {results.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle>Hasil Pencocokan Sementara</CardTitle>
                    <CardDescription>
                      Review hasil auto match sebelum menyimpan
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
                        <th className="h-10 px-4 text-left font-medium">Keterangan</th>
                        <th className="h-10 px-4 text-right font-medium">Jumlah</th>
                        <th className="h-10 px-4 text-left font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((r, i) => (
                        <tr key={i} className="border-b hover:bg-muted/50">
                          <td className="p-4 whitespace-nowrap">
                            {new Date(r.statementRow.date).toLocaleDateString("id-ID")}
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
                      Konfirmasi ({matchedCount} baris)
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        /* ── History List ── */
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Riwayat Rekonsiliasi
            </CardTitle>
            <CardDescription>
              Daftar rekonsiliasi bank yang telah dibuat
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingHistory ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Memuat data...
              </div>
            ) : reconciliations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <History className="h-12 w-12 mb-3 opacity-30" />
                <p className="font-medium">Belum ada rekonsiliasi</p>
                <p className="text-sm">Klik &quot;Rekonsiliasi Baru&quot; untuk memulai</p>
              </div>
            ) : (
              <div className="rounded-md border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/20 text-muted-foreground">
                      <th className="h-10 px-4 text-left font-medium">Periode</th>
                      <th className="h-10 px-4 text-left font-medium">Akun</th>
                      <th className="h-10 px-4 text-right font-medium">Saldo Bank</th>
                      <th className="h-10 px-4 text-right font-medium">Saldo Buku</th>
                      <th className="h-10 px-4 text-center font-medium">Status</th>
                      <th className="h-10 px-4 text-left font-medium">Dibuat</th>
                      <th className="h-10 px-4 text-right font-medium">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reconciliations.map((r) => (
                      <tr
                        key={r.id}
                        className="border-b hover:bg-muted/50 cursor-pointer"
                        onClick={() =>
                          router.push(`/finance/bank-reconciliation/${r.id}`)
                        }
                      >
                        <td className="p-4 whitespace-nowrap">
                          {new Date(r.periodStart).toLocaleDateString("id-ID", {
                            day: "2-digit",
                            month: "short",
                          })}{" "}
                          –{" "}
                          {new Date(r.periodEnd).toLocaleDateString("id-ID", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </td>
                        <td className="p-4">
                          <div className="font-medium">
                            {r.account.code}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {r.account.name}
                          </div>
                        </td>
                        <td className="p-4 text-right font-mono">
                          {formatRupiah(r.bankBalance)}
                        </td>
                        <td className="p-4 text-right font-mono">
                          {formatRupiah(r.bookBalance)}
                        </td>
                        <td className="p-4 text-center">
                          <StatusBadge status={r.status} />
                        </td>
                        <td className="p-4 text-muted-foreground text-xs">
                          {new Date(r.createdAt).toLocaleDateString("id-ID", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                          <br />
                          {r.createdBy.name}
                        </td>
                        <td className="p-4 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/finance/bank-reconciliation/${r.id}`);
                            }}
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Detail
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
