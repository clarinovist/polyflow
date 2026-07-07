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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CheckCircle,
  AlertCircle,
  Loader2,
  ArrowRight,
  Link2,
  Trash2,
  Plus,
  RefreshCw,
  CheckCircle2,
  DollarSign,
  BookOpen,
  Landmark,
  FileText,
  CircleDot,
} from "lucide-react";
import {
  getReconciliation,
  autoMatchAndSave,
  manualMatch,
  calculateAdjustedBalances,
  completeReconciliation,
  getGLEntries,
  getUnreconciledEntries,
  addAdjustment,
  removeAdjustment,
} from "@/actions/finance/reconciliation-actions";
import { formatRupiah } from "@/lib/utils/utils";
import { toast } from "sonner";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface ReconciliationItem {
  id: string;
  reconciliationId: string;
  bankDate: string | null;
  bankDescription: string | null;
  bankAmount: number | null;
  bankRef: string | null;
  glDate: string | null;
  glDescription: string | null;
  glDebit: number | null;
  glCredit: number | null;
  matchStatus: string;
  confidence: number | null;
  matchedBy: string | null;
  matchedAt: string | null;
  notes: string | null;
  journalLineId: string | null;
  journalLine: {
    id: string;
    debit: number;
    credit: number;
    reconciledAt: string | null;
    journalEntry: {
      id: string;
      entryNumber: string;
      entryDate: string;
      description: string;
      reference: string | null;
      referenceType: string | null;
    };
  } | null;
}

interface ReconciliationAdjustment {
  id: string;
  side: string;
  type: string;
  description: string;
  amount: number;
  journalEntry: { id: string; entryNumber: string } | null;
}

interface Reconciliation {
  id: string;
  accountId: string;
  periodStart: string;
  periodEnd: string;
  bankBalance: number;
  bookBalance: number;
  adjustedBankBalance: number | null;
  adjustedBookBalance: number | null;
  status: string;
  createdAt: string;
  account: { id: string; code: string; name: string };
  createdBy: { id: string; name: string | null };
  items: ReconciliationItem[];
  adjustments: ReconciliationAdjustment[];
}

interface GLEntry {
  id: string;
  date: string;
  entryNumber: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  isReconciled: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const STATUS_CONFIG: Record<string, { label: string; variant: string; color: string }> = {
  DRAFT: { label: "Draft", variant: "secondary", color: "bg-slate-500" },
  IN_PROGRESS: { label: "In Progress", variant: "default", color: "bg-blue-500" },
  COMPLETED: { label: "Selesai", variant: "default", color: "bg-emerald-500" },
};

function getStatusConfig(status: string) {
  return STATUS_CONFIG[status] ?? { label: status, variant: "secondary", color: "bg-slate-500" };
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function matchStatusLabel(status: string): string {
  switch (status) {
    case "MATCHED":
    case "MANUALLY_MATCHED":
      return "Cocok";
    case "UNMATCHED_BANK_ONLY":
      return "Belum Cocok";
    case "UNMATCHED_GL_ONLY":
      return "Hanya di GL";
    default:
      return status;
  }
}

function matchStatusIcon(status: string) {
  if (status === "MATCHED" || status === "MANUALLY_MATCHED") {
    return <CheckCircle className="h-3.5 w-3.5" />;
  }
  return <AlertCircle className="h-3.5 w-3.5" />;
}

/* -------------------------------------------------------------------------- */
/*  Main Component                                                             */
/* -------------------------------------------------------------------------- */

export function BankReconciliationDetailClient({
  reconciliation: initialData,
}: {
  reconciliation: Reconciliation;
}) {
  const [data, setData] = useState<Reconciliation>(initialData);
  const [glEntries, setGlEntries] = useState<GLEntry[]>([]);
  const [unreconciledEntries, setUnreconciledEntries] = useState<GLEntry[]>([]);
  const [_loading, _setLoading] = useState(false);
  const [autoMatching, setAutoMatching] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [calculating, setCalculating] = useState(false);

  // Manual match dialog
  const [matchDialogOpen, setMatchDialogOpen] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [matchingInProgress, setMatchingInProgress] = useState(false);

  // Adjustment dialog
  const [adjDialogOpen, setAdjDialogOpen] = useState(false);
  const [adjSide, setAdjSide] = useState<string>("BANK");
  const [adjType, setAdjType] = useState<string>("DEPOSIT_IN_TRANSIT");
  const [adjDesc, setAdjDesc] = useState("");
  const [adjAmount, setAdjAmount] = useState("");
  const [removingAdjId, setRemovingAdjId] = useState<string | null>(null);

  // Calculated balances
  const [adjustedBalances, setAdjustedBalances] = useState<{
    adjustedBankBalance: number;
    adjustedBookBalance: number;
    difference: number;
  } | null>(null);

  const [activeTab, setActiveTab] = useState("bank");

  /* ---- Derived data ---- */
  const matchedCount = data.items.filter(
    (i) => i.matchStatus === "MATCHED" || i.matchStatus === "MANUALLY_MATCHED"
  ).length;
  const unmatchedCount = data.items.filter(
    (i) => i.matchStatus === "UNMATCHED_BANK_ONLY"
  ).length;

  const statusCfg = getStatusConfig(data.status);

  /* ---- Load GL entries & unreconciled ---- */
  const loadGLEntries = useCallback(async () => {
    try {
      const [glResult, unResult] = await Promise.all([
        getGLEntries(data.accountId, new Date(data.periodStart), new Date(data.periodEnd)),
        getUnreconciledEntries(data.accountId, new Date(data.periodStart), new Date(data.periodEnd)),
      ]);
      if (glResult && glResult.success) setGlEntries(glResult.data as unknown as GLEntry[]);
      if (unResult && unResult.success) setUnreconciledEntries(unResult.data as unknown as GLEntry[]);
    } catch (err) {
      console.error("Failed to load GL entries:", err);
    }
  }, [data.accountId, data.periodStart, data.periodEnd]);

  useEffect(() => {
    loadGLEntries();
  }, [loadGLEntries]);

  /* ---- Refresh reconciliation ---- */
  const refreshData = useCallback(async () => {
    try {
      const result = await getReconciliation(data.id);
      if (result && result.success && result.data) {
        setData(result.data as Reconciliation);
      }
    } catch (err) {
      console.error("Failed to refresh:", err);
    }
  }, [data.id]);

  /* ---- Actions ---- */
  const handleAutoMatch = async () => {
    setAutoMatching(true);
    try {
      const result = await autoMatchAndSave(data.id);
      if (result && result.success) {
        const res = result.data as { matched: number; unmatched: number };
        toast.success(`${res.matched} item berhasil di-auto match`);
        await refreshData();
        await loadGLEntries();
      } else {
        toast.error(result?.error as string || "Gagal menjalankan auto match");
      }
    } catch {
      toast.error("Gagal menjalankan auto match");
    } finally {
      setAutoMatching(false);
    }
  };

  const handleManualMatch = async () => {
    if (!selectedItemId || !selectedEntryId) return;
    setMatchingInProgress(true);
    try {
      const result = await manualMatch(selectedItemId, selectedEntryId);
      if (result && result.success) {
        toast.success("Match berhasil ditambahkan");
        setMatchDialogOpen(false);
        setSelectedItemId(null);
        setSelectedEntryId(null);
        await refreshData();
        await loadGLEntries();
      } else {
        toast.error(result?.error as string || "Gagal melakukan manual match");
      }
    } catch {
      toast.error("Gagal melakukan manual match");
    } finally {
      setMatchingInProgress(false);
    }
  };

  const handleCalculateBalances = async () => {
    setCalculating(true);
    try {
      const result = await calculateAdjustedBalances(data.id);
      if (result && result.success) {
        const res = result.data as {
          adjustedBankBalance: number;
          adjustedBookBalance: number;
          difference: number;
        };
        setAdjustedBalances(res);
        await refreshData();
        toast.success("Adjusted balances dihitung");
      } else {
        toast.error(result?.error as string || "Gagal menghitung adjusted balances");
      }
    } catch {
      toast.error("Gagal menghitung adjusted balances");
    } finally {
      setCalculating(false);
    }
  };

  const handleCompleteReconciliation = async () => {
    // Validate: adjusted balances must be calculated and difference is zero
    if (!adjustedBalances) {
      toast.error("Hitung adjusted balances terlebih dahulu");
      return;
    }
    if (Math.abs(adjustedBalances.difference) > 0.01) {
      toast.error("Selisih adjusted balance harus nol untuk menyelesaikan rekonsiliasi");
      return;
    }

    setCompleting(true);
    try {
      const result = await completeReconciliation(data.id);
      if (result && result.success) {
        toast.success("Rekonsiliasi berhasil diselesaikan!");
        await refreshData();
      } else {
        toast.error(result?.error as string || "Gagal menyelesaikan rekonsiliasi");
      }
    } catch {
      toast.error("Gagal menyelesaikan rekonsiliasi");
    } finally {
      setCompleting(false);
    }
  };

  const handleAddAdjustment = async () => {
    if (!adjDesc.trim() || !adjAmount) {
      toast.error("Deskripsi dan jumlah wajib diisi");
      return;
    }
    const amount = parseFloat(adjAmount);
    if (isNaN(amount)) {
      toast.error("Jumlah harus berupa angka");
      return;
    }

    try {
      const result = await addAdjustment(data.id, adjSide as "BANK" | "BOOK", adjType as never, adjDesc, amount);
      if (result && result.success) {
        toast.success("Adjustment berhasil ditambahkan");
        setAdjDialogOpen(false);
        setAdjDesc("");
        setAdjAmount("");
        await refreshData();
      } else {
        toast.error(result?.error as string || "Gagal menambahkan adjustment");
      }
    } catch {
      toast.error("Gagal menambahkan adjustment");
    }
  };

  const handleRemoveAdjustment = async (adjId: string) => {
    setRemovingAdjId(adjId);
    try {
      const result = await removeAdjustment(adjId);
      if (result && result.success) {
        toast.success("Adjustment berhasil dihapus");
        await refreshData();
      } else {
        toast.error(result?.error as string || "Gagal menghapus adjustment");
      }
    } catch {
      toast.error("Gagal menghapus adjustment");
    } finally {
      setRemovingAdjId(null);
    }
  };

  /* ---- Open manual match dialog ---- */
  const openMatchDialog = (itemId: string) => {
    setSelectedItemId(itemId);
    setSelectedEntryId(null);
    setMatchDialogOpen(true);
  };

  /* ---- Summary values ---- */
  const bankBalance = data.bankBalance;
  const bookBalance = data.bookBalance;
  const adjBank = adjustedBalances?.adjustedBankBalance ?? data.adjustedBankBalance ?? null;
  const adjBook = adjustedBalances?.adjustedBookBalance ?? data.adjustedBookBalance ?? null;
  const difference = adjustedBalances?.difference ?? (adjBank !== null && adjBook !== null ? adjBank - adjBook : null);

  /* -------------------------------------------------------------------------- */
  /*  Render                                                                     */
  /* -------------------------------------------------------------------------- */

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Rekonsiliasi Bank</h1>
          <p className="text-muted-foreground mt-1">
            {data.account.code} — {data.account.name}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge
            variant="default"
            className={`${statusCfg.color} text-white px-3 py-1 text-sm font-medium`}
          >
            {statusCfg.label}
          </Badge>
        </div>
      </div>

      {/* Period info */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Periode</span>
              <p className="font-medium">
                {formatDate(data.periodStart)} — {formatDate(data.periodEnd)}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Dibuat oleh</span>
              <p className="font-medium">{data.createdBy.name}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Tanggal dibuat</span>
              <p className="font-medium">{formatDate(data.createdAt)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2 mb-2">
              <Landmark className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground uppercase tracking-wide">Saldo Bank</span>
            </div>
            <p className="text-lg font-bold font-mono">{formatRupiah(bankBalance)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2 mb-2">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground uppercase tracking-wide">Saldo Buku</span>
            </div>
            <p className="text-lg font-bold font-mono">{formatRupiah(bookBalance)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2 mb-2">
              <Landmark className="h-4 w-4 text-blue-500" />
              <span className="text-xs text-muted-foreground uppercase tracking-wide">Adj. Bank</span>
            </div>
            <p className={`text-lg font-bold font-mono ${adjBank !== null ? "" : "text-muted-foreground"}`}>
              {adjBank !== null ? formatRupiah(adjBank) : "—"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2 mb-2">
              <BookOpen className="h-4 w-4 text-blue-500" />
              <span className="text-xs text-muted-foreground uppercase tracking-wide">Adj. Buku</span>
            </div>
            <p className={`text-lg font-bold font-mono ${adjBook !== null ? "" : "text-muted-foreground"}`}>
              {adjBook !== null ? formatRupiah(adjBook) : "—"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2 mb-2">
              <CircleDot className={`h-4 w-4 ${difference !== null && Math.abs(difference) < 0.01 ? "text-emerald-500" : "text-red-500"}`} />
              <span className="text-xs text-muted-foreground uppercase tracking-wide">Selisih</span>
            </div>
            <p
              className={`text-lg font-bold font-mono ${
                difference === null
                  ? "text-muted-foreground"
                  : Math.abs(difference) < 0.01
                    ? "text-emerald-600"
                    : "text-red-600"
              }`}
            >
              {difference !== null ? formatRupiah(difference) : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3">
        {data.status !== "COMPLETED" && (
          <>
            <Button
              onClick={handleAutoMatch}
              disabled={autoMatching}
              variant="default"
              className="gap-2"
            >
              {autoMatching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Auto Match
            </Button>

            <Button
              onClick={handleCalculateBalances}
              disabled={calculating}
              variant="outline"
              className="gap-2"
            >
              {calculating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <DollarSign className="h-4 w-4" />
              )}
              Hitung Adjusted Balance
            </Button>

            <Button
              onClick={handleCompleteReconciliation}
              disabled={completing || (difference !== null && Math.abs(difference) > 0.01)}
              variant="default"
              className="gap-2 bg-emerald-600 hover:bg-emerald-700"
            >
              {completing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Selesaikan Rekonsiliasi
            </Button>
          </>
        )}

        <Button onClick={refreshData} variant="ghost" className="gap-2 ml-auto">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Match Progress */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center gap-4 text-sm">
            <span className="flex items-center gap-1.5 text-emerald-600 font-medium">
              <CheckCircle className="h-4 w-4" /> {matchedCount} cocok
            </span>
            <span className="flex items-center gap-1.5 text-amber-600 font-medium">
              <AlertCircle className="h-4 w-4" /> {unmatchedCount} belum cocok
            </span>
            <span className="text-muted-foreground">|</span>
            <span className="text-muted-foreground">
              Total {data.items.length} item bank
            </span>
          </div>
          {/* Progress bar */}
          <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-300"
              style={{
                width: `${data.items.length > 0 ? (matchedCount / data.items.length) * 100 : 0}%`,
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Tabs: Bank Statement | GL Entries | Adjustments */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="bank" className="gap-2">
            <Landmark className="h-4 w-4" />
            Mutasi Bank ({data.items.length})
          </TabsTrigger>
          <TabsTrigger value="gl" className="gap-2">
            <FileText className="h-4 w-4" />
            Jurnal GL ({glEntries.length})
          </TabsTrigger>
          <TabsTrigger value="adjustments" className="gap-2">
            <DollarSign className="h-4 w-4" />
            Penyesuaian ({data.adjustments.length})
          </TabsTrigger>
        </TabsList>

        {/* ---- Bank Statement Tab ---- */}
        <TabsContent value="bank">
          <Card>
            <CardHeader>
              <CardTitle>Mutasi Bank</CardTitle>
              <CardDescription>
                Daftar transaksi dari laporan bank — hijau = cocok, kuning = belum cocok
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/20">
                      <TableHead className="w-[120px]">Tanggal</TableHead>
                      <TableHead>Keterangan</TableHead>
                      <TableHead className="text-right w-[140px]">Jumlah</TableHead>
                      <TableHead className="w-[120px]">Status</TableHead>
                      <TableHead>Jurnal GL</TableHead>
                      {data.status !== "COMPLETED" && (
                        <TableHead className="w-[80px] text-right">Aksi</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.items.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                          Tidak ada data mutasi bank
                        </TableCell>
                      </TableRow>
                    ) : (
                      data.items.map((item) => {
                        const isMatched =
                          item.matchStatus === "MATCHED" ||
                          item.matchStatus === "MANUALLY_MATCHED";
                        return (
                          <TableRow
                            key={item.id}
                            className={
                              isMatched
                                ? "bg-emerald-50/50 hover:bg-emerald-50"
                                : "bg-amber-50/30 hover:bg-amber-50/60"
                            }
                          >
                            <TableCell className="whitespace-nowrap">
                              {formatDate(item.bankDate)}
                            </TableCell>
                            <TableCell className="max-w-[250px] truncate">
                              {item.bankDescription}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {formatRupiah(item.bankAmount)}
                            </TableCell>
                            <TableCell>
                              <span
                                className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded ${
                                  isMatched
                                    ? "text-emerald-700 bg-emerald-100"
                                    : "text-amber-700 bg-amber-100"
                                }`}
                              >
                                {matchStatusIcon(item.matchStatus)}
                                {matchStatusLabel(item.matchStatus)}
                              </span>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {item.journalLine ? (
                                <span className="flex items-center gap-1">
                                  <ArrowRight className="h-3 w-3" />
                                  {item.journalLine.journalEntry.entryNumber}
                                </span>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                            {data.status !== "COMPLETED" && (
                              <TableCell className="text-right">
                                {!isMatched && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 gap-1"
                                    onClick={() => openMatchDialog(item.id)}
                                  >
                                    <Link2 className="h-3.5 w-3.5" />
                                    Match
                                  </Button>
                                )}
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---- GL Entries Tab ---- */}
        <TabsContent value="gl">
          <Card>
            <CardHeader>
              <CardTitle>Jurnal GL</CardTitle>
              <CardDescription>
                Semua entri jurnal umum untuk akun ini dalam periode rekonsiliasi
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/20">
                      <TableHead className="w-[120px]">Tanggal</TableHead>
                      <TableHead className="w-[120px]">No. Jurnal</TableHead>
                      <TableHead>Keterangan</TableHead>
                      <TableHead className="text-right w-[140px]">Debit</TableHead>
                      <TableHead className="text-right w-[140px]">Kredit</TableHead>
                      <TableHead className="w-[100px]">Reconciled</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {glEntries.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                          Tidak ada data jurnal GL
                        </TableCell>
                      </TableRow>
                    ) : (
                      glEntries.map((entry) => (
                        <TableRow
                          key={entry.id}
                          className={
                            entry.isReconciled
                              ? "bg-emerald-50/50 hover:bg-emerald-50"
                              : "hover:bg-muted/30"
                          }
                        >
                          <TableCell className="whitespace-nowrap">
                            {formatDate(entry.date)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap font-mono text-sm">
                            {entry.entryNumber}
                          </TableCell>
                          <TableCell className="max-w-[250px] truncate">
                            {entry.description}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {entry.debit > 0 ? formatRupiah(entry.debit) : "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {entry.credit > 0 ? formatRupiah(entry.credit) : "—"}
                          </TableCell>
                          <TableCell>
                            {entry.isReconciled ? (
                              <span className="inline-flex items-center gap-1.5 text-emerald-700 text-xs font-medium bg-emerald-100 px-2 py-1 rounded">
                                <CheckCircle className="h-3.5 w-3.5" />
                                Ya
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                                Belum
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---- Adjustments Tab ---- */}
        <TabsContent value="adjustments">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle>Penyesuaian</CardTitle>
                  <CardDescription>
                    Daftar penyesuaian untuk bank maupun buku (deposit in transit, outstanding checks, dll)
                  </CardDescription>
                </div>
                {data.status !== "COMPLETED" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setAdjDialogOpen(true)}
                  >
                    <Plus className="h-4 w-4" />
                    Tambah
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {data.adjustments.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  Belum ada penyesuaian. Klik &quot;Tambah&quot; untuk menambahkan.
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/20">
                        <TableHead className="w-[100px]">Sisi</TableHead>
                        <TableHead className="w-[160px]">Tipe</TableHead>
                        <TableHead>Keterangan</TableHead>
                        <TableHead className="text-right w-[140px]">Jumlah</TableHead>
                        {data.status !== "COMPLETED" && (
                          <TableHead className="w-[60px]" />
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.adjustments.map((adj) => (
                        <TableRow key={adj.id}>
                          <TableCell>
                            <Badge variant={adj.side === "BANK" ? "default" : "secondary"}>
                              {adj.side === "BANK" ? "Bank" : "Buku"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">{adj.type}</TableCell>
                          <TableCell className="text-sm">{adj.description}</TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {formatRupiah(adj.amount)}
                          </TableCell>
                          {data.status !== "COMPLETED" && (
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={() => handleRemoveAdjustment(adj.id)}
                                disabled={removingAdjId === adj.id}
                              >
                                {removingAdjId === adj.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3.5 w-3.5" />
                                )}
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ---- Manual Match Dialog ---- */}
      <Dialog open={matchDialogOpen} onOpenChange={setMatchDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Manual Match</DialogTitle>
            <DialogDescription>
              Pilih entri GL yang ingin dicocokkan dengan item bank ini
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[400px] overflow-y-auto">
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/20">
                    <TableHead className="w-[120px]">Tanggal</TableHead>
                    <TableHead className="w-[120px]">No. Jurnal</TableHead>
                    <TableHead>Keterangan</TableHead>
                    <TableHead className="text-right w-[140px]">Debit</TableHead>
                    <TableHead className="text-right w-[140px]">Kredit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unreconciledEntries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                        Tidak ada entri GL yang belum direkonsiliasi
                      </TableCell>
                    </TableRow>
                  ) : (
                    unreconciledEntries.map((entry) => (
                      <TableRow
                        key={entry.id}
                        className={`cursor-pointer transition-colors ${
                          selectedEntryId === entry.id
                            ? "bg-blue-100 hover:bg-blue-100"
                            : "hover:bg-muted/50"
                        }`}
                        onClick={() => setSelectedEntryId(entry.id)}
                      >
                        <TableCell className="whitespace-nowrap">
                          {formatDate(entry.date)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-mono text-sm">
                          {entry.entryNumber}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-sm">
                          {entry.description}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {entry.debit > 0 ? formatRupiah(entry.debit) : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {entry.credit > 0 ? formatRupiah(entry.credit) : "—"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMatchDialogOpen(false)}>
              Batal
            </Button>
            <Button
              onClick={handleManualMatch}
              disabled={!selectedEntryId || matchingInProgress}
              className="gap-2"
            >
              {matchingInProgress && <Loader2 className="h-4 w-4 animate-spin" />}
              <Link2 className="h-4 w-4" />
              Match
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- Add Adjustment Dialog ---- */}
      <Dialog open={adjDialogOpen} onOpenChange={setAdjDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tambah Penyesuaian</DialogTitle>
            <DialogDescription>
              Tambahkan penyesuaian untuk saldo bank atau buku
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Sisi</Label>
                <Select value={adjSide} onValueChange={setAdjSide}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BANK">Bank</SelectItem>
                    <SelectItem value="BOOK">Buku</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tipe</Label>
                <Select value={adjType} onValueChange={setAdjType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DEPOSIT_IN_TRANSIT">Deposit In Transit</SelectItem>
                    <SelectItem value="OUTSTANDING_CHECK">Outstanding Check</SelectItem>
                    <SelectItem value="BANK_ERROR">Bank Error</SelectItem>
                    <SelectItem value="BOOK_ERROR">Book Error</SelectItem>
                    <SelectItem value="OTHER">Lainnya</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Deskripsi</Label>
              <Input
                value={adjDesc}
                onChange={(e) => setAdjDesc(e.target.value)}
                placeholder="Contoh: Transfer belum masuk di bank"
              />
            </div>
            <div className="space-y-2">
              <Label>Jumlah (Rp)</Label>
              <Input
                type="number"
                value={adjAmount}
                onChange={(e) => setAdjAmount(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjDialogOpen(false)}>
              Batal
            </Button>
            <Button onClick={handleAddAdjustment} className="gap-2">
              <Plus className="h-4 w-4" />
              Tambah
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
