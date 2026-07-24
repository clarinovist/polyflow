"use client";

import { useState } from "react";
import { ArrowLeft, Calendar, Clock, MapPin, FileText, Navigation, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useRouter } from "next/navigation";
import { format } from "date-fns";

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

type JourneyItem = {
  id: string;
  status: "PENDING" | "VISITING" | "COMPLETED";
};

export default function SalesMobileVisitsHistoryPage() {
  const router = useRouter();
  
  // Lazily initialize state from localStorage to avoid set-state-in-effect warning
  const [logs, setLogs] = useState<VisitLog[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("visit_logs");
      if (saved) return JSON.parse(saved) as VisitLog[];
    }
    return [];
  });

  const formatDuration = (totalSeconds: number) => {
    if (totalSeconds < 60) return `${totalSeconds} detik`;
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return secs > 0 ? `${mins} menit ${secs} detik` : `${mins} menit`;
  };

  const clearHistory = () => {
    if (confirm("Apakah Anda yakin ingin menghapus semua riwayat kunjungan?")) {
      localStorage.removeItem("visit_logs");
      // Reset call plan statuses to PENDING for demo testing
      const savedPlan = localStorage.getItem("today_journey_plan");
      if (savedPlan) {
        const plan = JSON.parse(savedPlan) as JourneyItem[];
        const reset = plan.map((item) => ({ ...item, status: "PENDING" as const }));
        localStorage.setItem("today_journey_plan", JSON.stringify(reset));
      }
      setLogs([]);
    }
  };

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
        {logs.length > 0 && (
          <Button
            variant="ghost"
            size="icon"
            onClick={clearHistory}
            className="text-destructive hover:bg-destructive/10"
            title="Hapus Riwayat"
          >
            <Trash2 className="h-5 w-5" />
          </Button>
        )}
      </div>

      {/* History list */}
      {logs.length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-2xl bg-muted/5">
          <MapPin className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-40" />
          <p className="text-sm font-semibold text-muted-foreground">Belum ada kunjungan hari ini</p>
          <p className="text-xs text-muted-foreground/80 mt-1 max-w-[200px] mx-auto">
            Check-in di halaman customer untuk mulai mencatat aktivitas kunjungan.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {logs.map((log) => {
            const date = new Date(log.checkInTime);
            return (
              <div
                key={log.id}
                className="border rounded-2xl p-4 bg-card shadow-xs space-y-3.5 relative overflow-hidden"
              >
                {/* Accent border left */}
                <div className="absolute top-0 bottom-0 left-0 w-1.5 bg-emerald-500" />

                {/* Top Info */}
                <div className="pl-1.5 flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <h3 className="font-bold text-sm text-foreground truncate">{log.customerName}</h3>
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
                      <Calendar className="h-3 w-3" />
                      {format(date, "dd MMM yyyy, HH:mm")}
                    </span>
                  </div>
                  <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 font-bold border-emerald-100 shrink-0 text-[10px]">
                    Selesai
                  </Badge>
                </div>

                {/* Grid details */}
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

                {/* Visit Notes */}
                <div className="pl-1.5 p-3 bg-muted/40 rounded-xl space-y-1 text-xs">
                  <span className="flex items-center gap-1 text-muted-foreground font-semibold text-[10px]">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground/60" /> Catatan Hasil Kunjungan:
                  </span>
                  <p className="text-foreground italic leading-relaxed whitespace-pre-line">
                    &quot;{log.notes}&quot;
                  </p>
                </div>

                {/* Visit Photo Attachment */}
                {log.photoUrl && (
                  <div className="pl-1.5">
                    <span className="text-[10px] font-semibold text-muted-foreground block mb-1">📸 Foto Bukti Kunjungan:</span>
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
