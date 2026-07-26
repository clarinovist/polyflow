"use client";

import { useState, useEffect, useMemo } from "react";
import { ArrowLeft, Calendar, Clock, MapPin, FileText, Navigation, Trash2, CloudLightning, CheckCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { getServerVisits } from "@/actions/sales/route-plans";

type VisitLog = {
  id: string;
  customerId: string;
  customerName: string;
  checkInTime: string;
  checkOutTime: string;
  durationSeconds: number;
  distance: number;
  notes: string;
  photoUrl?: string | null;
  synced?: boolean;
  isExtraCall?: boolean;
  extraReason?: string | null;
};

const EC_REASON_LABELS: Record<string, string> = {
  TOKO_BARU: "Toko Baru",
  DEKAT_RUTE: "Dekat Rute",
  PERMINTAAN_DADAKAN: "Permintaan Dadakan",
  TOKO_TUTUP_GASI: "Toko Tutup Ganti",
};

export default function SalesMobileVisitsHistoryPage() {
  const router = useRouter();

  const [localLogs, setLocalLogs] = useState<VisitLog[]>([]);
  const [serverLogs, setServerLogs] = useState<VisitLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Load local logs
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("visit_logs");
      if (saved) setLocalLogs(JSON.parse(saved) as VisitLog[]);
    }
  }, []);

  // Fetch server logs
  useEffect(() => {
    const fetchServer = async () => {
      try {
        const today = new Date().toISOString().split("T")[0];
        const result = await getServerVisits(today);
        if (result?.success && result.data) {
          setServerLogs(result.data as VisitLog[]);
        }
      } catch {
        // Silently fail — local logs still work
      } finally {
        setLoading(false);
      }
    };
    fetchServer();
  }, []);

  // Merge: server logs first (synced), then local unsynced (deduped)
  const allLogs = useMemo(() => {
    const serverIds = new Set(serverLogs.map((l) => l.id));
    const unsyncedLocal = localLogs.filter(
      (l) => !serverIds.has(l.id) && l.synced === false
    );
    return [...serverLogs, ...unsyncedLocal];
  }, [serverLogs, localLogs]);

  const formatDuration = (totalSeconds: number) => {
    if (totalSeconds < 60) return `${totalSeconds} detik`;
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return secs > 0 ? `${mins} menit ${secs} detik` : `${mins} menit`;
  };

  const clearHistory = () => {
    if (confirm("Apakah Anda yakin ingin menghapus semua riwayat kunjungan lokal?")) {
      localStorage.removeItem("visit_logs");
      setLocalLogs([]);
    }
  };

  const stats = useMemo(() => {
    const total = allLogs.length;
    const unsynced = allLogs.filter((l) => l.synced === false).length;
    const synced = allLogs.filter((l) => l.synced === true).length;
    const extraCalls = allLogs.filter((l) => l.isExtraCall === true).length;
    return { total, unsynced, synced, extraCalls };
  }, [allLogs]);

  return (
    <div className="p-4 space-y-4 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/field/sales")}
            className="shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Riwayat Kunjungan</h1>
            <p className="text-sm text-muted-foreground">Log aktivitas lapangan Anda</p>
          </div>
        </div>
        {localLogs.length > 0 && (
          <Button
            variant="ghost"
            size="icon"
            onClick={clearHistory}
            className="text-destructive hover:bg-destructive/10"
            title="Hapus Riwayat Lokal"
          >
            <Trash2 className="h-5 w-5" />
          </Button>
        )}
      </div>

      {/* Stats Summary */}
      {allLogs.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
          <span className="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
            Total: {stats.total}
          </span>
          {stats.synced > 0 && (
            <span className="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
              <CheckCircle className="inline h-3 w-3 mr-1" />
              Server: {stats.synced}
            </span>
          )}
          {stats.unsynced > 0 && (
            <span className="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
              <CloudLightning className="inline h-3 w-3 mr-1" />
              Belum sync: {stats.unsynced}
            </span>
          )}
          {stats.extraCalls > 0 && (
            <span className="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400">
              <AlertTriangle className="inline h-3 w-3 mr-1" />
              Extra Call: {stats.extraCalls}
            </span>
          )}
        </div>
      )}

      {/* History list */}
      {loading ? (
        <div className="text-center py-16">
          <p className="text-sm text-muted-foreground">Memuat data kunjungan...</p>
        </div>
      ) : allLogs.length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-2xl bg-muted/5">
          <MapPin className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-40" />
          <p className="text-sm font-semibold text-muted-foreground">Belum ada kunjungan hari ini</p>
          <p className="text-xs text-muted-foreground/80 mt-1 max-w-[200px] mx-auto">
            Check-in di halaman customer untuk mulai mencatat aktivitas kunjungan.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {allLogs.map((log) => {
            const date = new Date(log.checkInTime);
            const isSynced = log.synced === true;
            const isEC = log.isExtraCall === true;

            return (
              <div
                key={log.id}
                className="border rounded-2xl p-4 bg-card shadow-xs space-y-3.5 relative overflow-hidden"
              >
                <div className={`absolute top-0 bottom-0 left-0 w-1.5 ${
                  isEC ? "bg-orange-500" : isSynced ? "bg-emerald-500" : "bg-amber-500"
                }`} />

                <div className="pl-1.5 flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <h3 className="font-bold text-sm text-foreground truncate">{log.customerName}</h3>
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
                      <Calendar className="h-3 w-3" />
                      {format(date, "dd MMM yyyy, HH:mm")}
                    </span>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    {isEC && (
                      <Badge className="font-bold border shrink-0 text-[10px] bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400 border-orange-100">
                        <AlertTriangle className="inline h-2.5 w-2.5 mr-0.5" />
                        EC
                      </Badge>
                    )}
                    <Badge
                      className={`font-bold border shrink-0 text-[10px] ${
                        isSynced
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border-emerald-100"
                          : "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border-amber-100"
                      }`}
                    >
                      {isSynced ? "Server" : "Belum sync"}
                    </Badge>
                  </div>
                </div>

                {/* EC Reason */}
                {isEC && log.extraReason && (
                  <div className="pl-1.5 flex items-center gap-1.5 text-[10px] text-orange-700 dark:text-orange-400">
                    <AlertTriangle className="h-3 w-3" />
                    <span className="font-semibold">Alasan:</span>
                    <span>{EC_REASON_LABELS[log.extraReason] || log.extraReason}</span>
                  </div>
                )}

                <div className="pl-1.5 grid grid-cols-2 gap-3 pt-2.5 border-t text-xs">
                  <div className="space-y-1">
                    <span className="flex items-center gap-1 text-muted-foreground text-[10px] uppercase font-bold tracking-wider">
                      <Clock className="h-3.5 w-3.5" /> Durasi
                    </span>
                    <p className="font-semibold text-foreground">{formatDuration(log.durationSeconds)}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="flex items-center gap-1 text-muted-foreground text-[10px] uppercase font-bold tracking-wider">
                      <Navigation className="h-3.5 w-3.5" /> Jarak
                    </span>
                    <p className="font-semibold text-foreground">{log.distance} meter</p>
                  </div>
                </div>

                <div className="pl-1.5 p-3 bg-muted/40 rounded-xl space-y-1 text-xs">
                  <span className="flex items-center gap-1 text-muted-foreground font-semibold text-[10px]">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground/60" /> Catatan:
                  </span>
                  <p className="text-foreground italic leading-relaxed whitespace-pre-line">
                    &quot;{log.notes}&quot;
                  </p>
                </div>

                {log.photoUrl && (
                  <div className="pl-1.5">
                    <span className="text-[10px] font-semibold text-muted-foreground block mb-1">Foto Bukti:</span>
                    <div className="relative border rounded-xl overflow-hidden h-32 w-44 bg-muted/20 shadow-xs">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={log.photoUrl} className="w-full h-full object-cover" alt="Bukti Kunjungan" />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
