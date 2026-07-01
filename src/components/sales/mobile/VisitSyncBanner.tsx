"use client";

import { useState, useEffect } from "react";
import { CloudLightning, Loader2, Check } from "lucide-react";
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
  distance: number;
  notes: string;
  photoUrl?: string | null;
  synced?: boolean;
};

export function VisitSyncBanner() {
  const [unsyncedLogs, setUnsyncedLogs] = useState<VisitLog[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  // Sync check on mount
  useEffect(() => {
    setIsOnline(navigator.onLine);
    
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    checkUnsyncedLogs();

    // Poll for changes
    const interval = setInterval(checkUnsyncedLogs, 3000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(interval);
    };
  }, []);

  const checkUnsyncedLogs = () => {
    const saved = localStorage.getItem("visit_logs");
    if (saved) {
      const logs = JSON.parse(saved) as VisitLog[];
      const unsynced = logs.filter((log) => log.synced === false);
      setUnsyncedLogs(unsynced);
    }
  };

  const handleSync = async () => {
    if (unsyncedLogs.length === 0) return;
    if (!isOnline) {
      toast.error("Tidak ada koneksi internet. Aktifkan internet untuk sinkronisasi.");
      return;
    }

    setIsSyncing(true);
    try {
      const payload = unsyncedLogs.map((log) => ({
        customerId: log.customerId,
        checkInTime: log.checkInTime,
        checkOutTime: log.checkOutTime,
        durationSeconds: log.durationSeconds,
        latitude: -6.2, // Default mock latitude if GPS precision was off
        longitude: 106.8, // Default mock longitude
        distance: log.distance,
        notes: log.notes,
        photoUrl: log.photoUrl || null,
      }));

      const res = await syncVisitLogsAction(payload);
      if (res?.success) {
        // Mark all as synced in localstorage
        const saved = localStorage.getItem("visit_logs");
        if (saved) {
          const logs = JSON.parse(saved) as VisitLog[];
          const updated = logs.map((log) => {
            if (log.synced === false) {
              return { ...log, synced: true };
            }
            return log;
          });
          localStorage.setItem("visit_logs", JSON.stringify(updated));
        }

        toast.success(`Berhasil sinkronisasi ${unsyncedLogs.length} kunjungan ke server!`);
        setUnsyncedLogs([]);
      } else {
        toast.error((res as { error?: string })?.error || "Gagal sinkronisasi data ke server");
      }
    } catch (err) {
      console.error(err);
      toast.error("Gagal terhubung ke server untuk sinkronisasi.");
    } finally {
      setIsSyncing(false);
    }
  };

  if (unsyncedLogs.length === 0) return null;

  return (
    <div className="p-3.5 bg-amber-500/10 dark:bg-amber-500/5 border border-amber-500/30 rounded-2xl flex items-center justify-between gap-3 animate-in slide-in-from-top-3 duration-200">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="h-8 w-8 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
          <CloudLightning className="h-4.5 w-4.5 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="min-w-0">
          <h4 className="font-bold text-xs text-amber-800 dark:text-amber-300">
            Sinkronisasi Tertunda
          </h4>
          <p className="text-[10px] text-amber-700/80 dark:text-amber-400/80 truncate">
            Ada {unsyncedLogs.length} kunjungan belum disimpan di server database.
          </p>
        </div>
      </div>

      <Button
        onClick={handleSync}
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
  );
}
