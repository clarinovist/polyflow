'use client';

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ClipboardList, UserCheck, Wrench, LayoutDashboard, LogOut } from "lucide-react";
import { kioskLabels } from "@/lib/labels";
import { KioskOperatorGate } from "@/components/kiosk/KioskOperatorGate";
import { KioskOperatorChip } from "@/components/kiosk/KioskOperatorChip";
import { MyPortalQr } from "@/components/kiosk/MyPortalQr";
import { KioskTodayStrip } from "@/components/kiosk/KioskTodayStrip";
import {
  getOperatorTodaySummary,
  type OperatorTodaySummary,
} from "@/actions/production/production-execution";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Employee {
  id: string;
  name: string;
  machineIds?: string[];
  machineNames?: string[];
}

interface KioskHubProps {
  employees: Employee[];
  machines: Array<{ id: string; name: string }>;
  activeJobCount: number;
  hasProsesKhusus?: boolean;
}

export function KioskHub({ employees, machines, activeJobCount, hasProsesKhusus = true }: KioskHubProps) {
  const [operatorId, setOperatorId] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [summary, setSummary] = useState<OperatorTodaySummary | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);

  const fetchSummary = useCallback(async (id: string) => {
    setIsLoadingSummary(true);
    try {
      const res = await getOperatorTodaySummary(id);
      if (res.success && res.data) {
        setSummary(res.data as OperatorTodaySummary);
      } else {
        setSummary(null);
      }
    } catch {
      setSummary(null);
    } finally {
      setIsLoadingSummary(false);
    }
  }, []);

  useEffect(() => {
    const saved = sessionStorage.getItem('kiosk_operator_id');
    if (saved) {
      setOperatorId(saved);
      fetchSummary(saved);
    }
    setIsInitialized(true);
  }, [fetchSummary]);

  const handleOperatorSelect = (id: string) => {
    setOperatorId(id);
    sessionStorage.setItem('kiosk_operator_id', id);
    fetchSummary(id);
  };

  const handleConfirmLogout = () => {
    sessionStorage.removeItem('kiosk_operator_id');
    setOperatorId(null);
    setSummary(null);
    setIsLogoutDialogOpen(false);
  };

  if (!isInitialized) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!operatorId) {
    return (
      <div className="p-4 md:p-6 max-w-7xl mx-auto">
        <KioskOperatorGate
          employees={employees}
          machines={machines}
          onSelect={handleOperatorSelect}
        />
      </div>
    );
  }

  const currentEmployee = employees.find(e => e.id === operatorId);
  const machineNames = (currentEmployee?.machineIds?.map(id => machines.find(m => m.id === id)?.name).filter((n): n is string => !!n)) || [];

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Operator chip + logout */}
      <div className="flex items-center justify-between bg-emerald-500/5 p-4 rounded-xl border-2 border-emerald-500/20 shadow-sm">
        <KioskOperatorChip
          name={currentEmployee?.name || ''}
          machineNames={machineNames}
        />
        <Button
          variant="destructive"
          size="sm"
          onClick={() => setIsLogoutDialogOpen(true)}
          className="h-10 font-bold px-4"
        >
          <LogOut className="mr-2 h-4 w-4" />
          {kioskLabels.sessionLogout}
        </Button>
      </div>

      {/* Progress Saya Hari Ini Strip */}
      <KioskTodayStrip
        operatorName={currentEmployee?.name || ''}
        summary={summary}
        isLoading={isLoadingSummary}
      />

      {/* Logout Confirmation Dialog with Shift Summary */}
      <AlertDialog open={isLogoutDialogOpen} onOpenChange={setIsLogoutDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Keluar Sesi Operator?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 pt-2 text-sm text-foreground">
                <p className="text-muted-foreground">
                  Ringkasan shift hari ini untuk <strong>{currentEmployee?.name}</strong>:
                </p>
                {summary ? (
                  <div className="rounded-lg border bg-muted/40 p-3 space-y-1.5 font-medium">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Job dikerjakan:</span>
                      <span className="font-bold">{summary.jobCount} job</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Hasil bagus:</span>
                      <span className="font-bold text-emerald-600">{summary.goodQty.toLocaleString('id-ID')} kg</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Scrap:</span>
                      <span className="font-bold text-amber-600">{summary.scrapQty.toLocaleString('id-ID')} kg</span>
                    </div>
                    {summary.activeJobsCount > 0 && (
                      <p className="text-xs text-amber-600 font-semibold pt-1 border-t">
                        ⚠️ Masih ada {summary.activeJobsCount} job aktif yang belum di-stop.
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Tidak ada data shift hari ini.</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Pastikan pekerjaan telah tercatat dengan benar sebelum menyerahkan tablet ke operator berikutnya.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmLogout} className="bg-destructive hover:bg-destructive/90">
              Keluar Sesi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Hub tiles */}
      <div>
        <h1 className="text-2xl md:text-3xl font-black tracking-tighter uppercase mb-1">
          {kioskLabels.hubTitle}
        </h1>
        <p className="text-sm text-muted-foreground font-medium">{kioskLabels.hubSubtitle}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
        {/* Produksi / SPK */}
        <Link href="/kiosk/jobs" className="block">
          <div className="group relative bg-card border-2 rounded-2xl p-6 md:p-8 hover:border-primary hover:shadow-lg transition-all active:scale-[0.98] cursor-pointer min-h-[140px] md:min-h-[160px] flex flex-col justify-between">
            <div>
              <div className="h-14 w-14 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mb-4 group-hover:bg-emerald-200 transition-colors">
                <ClipboardList className="h-7 w-7 text-emerald-600" />
              </div>
              <h2 className="text-xl md:text-2xl font-black uppercase tracking-tight">
                {kioskLabels.tileProduksi}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">{kioskLabels.tileProduksiDesc}</p>
            </div>
            {activeJobCount > 0 && (
              <div className="absolute top-4 right-4 bg-emerald-600 text-white text-xs font-bold px-2.5 py-1 rounded-full">
                {activeJobCount} aktif
              </div>
            )}
          </div>
        </Link>

        {/* Absensi */}
        <Link href="/kiosk/attendance" className="block">
          <div className="group relative bg-card border-2 rounded-2xl p-6 md:p-8 hover:border-primary hover:shadow-lg transition-all active:scale-[0.98] cursor-pointer min-h-[140px] md:min-h-[160px] flex flex-col justify-between">
            <div>
              <div className="h-14 w-14 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-4 group-hover:bg-blue-200 transition-colors">
                <UserCheck className="h-7 w-7 text-blue-600" />
              </div>
              <h2 className="text-xl md:text-2xl font-black uppercase tracking-tight">
                {kioskLabels.tileAbsensi}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">{kioskLabels.tileAbsensiDesc}</p>
            </div>
          </div>
        </Link>

        {/* Proses Khusus */}
        {hasProsesKhusus && (
          <div className="bg-card border-2 rounded-2xl p-6 md:p-8 min-h-[140px] md:min-h-[160px] flex flex-col justify-between">
            <div>
              <div className="h-14 w-14 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mb-4">
                <Wrench className="h-7 w-7 text-purple-600" />
              </div>
              <h2 className="text-xl md:text-2xl font-black uppercase tracking-tight">
                {kioskLabels.tileProsesKhusus}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">{kioskLabels.tileProsesKhususDesc}</p>
            </div>
            <div className="flex gap-2 mt-4">
              <Link href="/kiosk/production/hd" className="flex-1">
                <div className="h-11 rounded-lg border-2 bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800 flex items-center justify-center text-sm font-bold text-purple-700 hover:bg-purple-100 transition-colors active:scale-95">
                  HD
                </div>
              </Link>
              <Link href="/kiosk/production/potongplong" className="flex-1">
                <div className="h-11 rounded-lg border-2 bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800 flex items-center justify-center text-sm font-bold text-purple-700 hover:bg-purple-100 transition-colors active:scale-95">
                  Potong/Plong
                </div>
              </Link>
            </div>
          </div>
        )}

        {/* Status Saya (deep link to My Portal) */}
        <Link href="/my" className="block">
          <div className="group relative bg-card border-2 rounded-2xl p-6 md:p-8 hover:border-primary hover:shadow-lg transition-all active:scale-[0.98] cursor-pointer min-h-[140px] md:min-h-[160px] flex flex-col justify-between">
            <div>
              <div className="h-14 w-14 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mb-4 group-hover:bg-amber-200 transition-colors">
                <LayoutDashboard className="h-7 w-7 text-amber-600" />
              </div>
              <h2 className="text-xl md:text-2xl font-black uppercase tracking-tight">
                {kioskLabels.tileStatusSaya}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">{kioskLabels.tileStatusSayaDesc}</p>
            </div>
          </div>
        </Link>
      </div>

      {/* My Portal QR */}
      <MyPortalQr />
    </div>
  );
}
