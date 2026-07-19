"use client";

import { useState, useEffect, useCallback } from "react";
import { CloudLightning, Loader2, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { syncVisitLogsAction } from "@/actions/sales/visits";
import { toast } from "sonner";

type VisitLog = {
  id: string;
  customerId: string;
  customerName: string;
  checkInTime: string;
  checkOutTime: string;
  durationSeconds: number;
  latitude: number;
  longitude: number;
  distance: number;
  notes: string;
  photoUrl?: string | null;
  synced?: boolean;
  retryCount?: number;
};

const MAX_RETRIES = 3;

export function VisitSyncBanner() {
  const [unsyncedLogs, setUnsyncedLogs] = useState<VisitLog[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [failedCount, setFailedCount] = useState(0);

  const checkUnsyncedLogs = useCallback(() => {
    const saved = localStorage.getItem("visit_logs");
    if (saved) {
      const logs = JSON.parse(saved) as VisitLog[];
      const unsynced = logs.filter((log) => log.synced === false);
      const failed = logs.filter((log) => log.synced === false && (log.retryCount ?? 0) >= MAX_RETRIES);
      setUnsyncedLogs(unsynced);
      setFailedCount(failed.length);
    }
  }, []);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    
    const handleOnline = () => {
      setIsOnline(true);
      // Auto-retry when coming back online
      setTimeout(checkUnsyncedLogs, 500);
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    checkUnsyncedLogs();
    const interval = setInterval(checkUnsyncedLogs, 3000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(interval);
    };
  }, [checkUnsyncedLogs]);

  const handleSync = async (retryLogs: VisitLog[] | null = null) => {
    const logsToSync = retryLogs ?? unsyncedLogs;
    if (logsToSync.length === 0) return;
    if (!isOnline) {
      toast.error("Tidak ada koneksi internet. Aktifkan internet untuk sinkronisasi.");
      return;
    }

    setIsSyncing(true);
    try {
      const payload = logsToSync.map((log) => ({
        customerId: log.customerId,
        checkInTime: log.checkInTime,
        checkOutTime: log.checkOutTime,
        durationSeconds: log.durationSeconds,
        latitude: log.latitude || -6.2,
        longitude: log.longitude || 106.8,
        distance: log.distance,
        notes: log.notes,
        photoUrl: log.photoUrl || null,
      }));

      const res = await syncVisitLogsAction(payload);
      if (res?.success) {
        const saved = localStorage.getItem("visit_logs");
        if (saved) {
          const logs = JSON.parse(saved) as VisitLog[];
          const syncedIds = new Set(logsToSync.map((l) => l.id));
          const updated = logs.map((log) => {
            if (syncedIds.has(log.id)) {
              return { ...log, synced: true, retryCount: 0 };
            }
            return log;
          });
          localStorage.setItem("visit_logs", JSON.stringify(updated));
        }

        toast.success(`Berhasil sinkronisasi ${logsToSync.length} kunjungan ke server!`);
        checkUnsyncedLogs();
      } else {
        // Mark failed logs with retry count
        markFailed(logsToSync);
        toast.error((res as { error?: string })?.error || "Gagal sinkronisasi data ke server");
      }
    } catch (err) {
      console.error(err);
      markFailed(logsToSync);
      toast.error("Gagal terhubung ke server untuk sinkronisasi.");
    } finally {
      setIsSyncing(false);
    }
  };

  const markFailed = (failedLogs: VisitLog[]) => {
    const saved = localStorage.getItem("visit_logs");
    if (saved) {
      const logs = JSON.parse(saved) as VisitLog[];
      const failedIds = new Set(failedLogs.map((l) => l.id));
      const updated = logs.map((log) => {
        if (failedIds.has(log.id)) {
          return { ...log, retryCount: (log.retryCount ?? 0) + 1 };
        }
        return log;
      });
      localStorage.setItem("visit_logs", JSON.stringify(updated));
      checkUnsyncedLogs();
    }
  };

  const handleRetryFailed = () => {
    const saved = localStorage.getItem("visit_logs");
    if (saved) {
      const logs = JSON.parse(saved) as VisitLog[];
      const retryable = logs.filter(
        (log) => log.synced === false && (log.retryCount ?? 0) < MAX_RETRIES,
      );
      if (retryable.length > 0) {
        handleSync(retryable);
      }
    }
  };

  const handleClearFailed = () => {
    const saved = localStorage.getItem("visit_logs");
    if (saved) {
      const logs = JSON.parse(saved) as VisitLog[];
      const updated = logs.filter(
        (log) => log.synced !== false || (log.retryCount ?? 0) < MAX_RETRIES,
      );
      localStorage.setItem("visit_logs", JSON.stringify(updated));
      checkUnsyncedLogs();
      toast.info("Data kunjungan gagal disinkronisasi telah dibersihkan.");
    }
  };

  if (unsyncedLogs.length === 0) return null;

  return (
    <div className="p-3.5 bg-amber-500/10 dark:bg-amber-500/5 border border-amber-500/30 rounded-2xl flex items-center justify-between gap-3 animate-in slide-in-from-top-3 duration-200">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="h-8 w-8 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
          {failedCount > 0 ? (
            <AlertTriangle className="h-4.5 w-4.5 text-red-500" />
          ) : (
            <CloudLightning className="h-4.5 w-4.5 text-amber-600 dark:text-amber-400" />
          )}
        </div>
        <div className="min-w-0">
          <h4 className="font-bold text-xs text-amber-800 dark:text-amber-300">
            {failedCount > 0 ? `${failedCount} kunjungan gagal sync` : "Sinkronisasi Tertunda"}
          </h4>
          <p className="text-[10px] text-amber-700/80 dark:text-amber-400/80 truncate">
            Ada {unsyncedLogs.length} kunjungan belum disimpan di server database.
          </p>
        </div>
      </div>

      <div className="flex gap-1.5">
        {failedCount > 0 && (
          <>
            <Button
              onClick={handleRetryFailed}
              disabled={isSyncing || !isOnline}
              size="sm"
              variant="outline"
              className="h-8 rounded-lg px-2 text-xs"
            >
              Coba Ulang
            </Button>
            <Button
              onClick={handleClearFailed}
              size="sm"
              variant="ghost"
              className="h-8 rounded-lg px-2 text-xs text-red-600"
            >
              Hapus
            </Button>
          </>
        )}
        <Button
          onClick={() => handleSync()}
          disabled={isSyncing}
          size="sm"
          className="h-8 rounded-lg px-3 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs active:scale-95 transition-transform"
        >
          {isSyncing ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
              Sync...
            </>
          ) : (
            <>
              <Check className="h-3 w-3 mr-1" />
              Sync Now
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
