"use client";

import { useState, useEffect, useMemo } from "react";
import { CheckCircle2, MapPin, ChevronRight, Route } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import Link from "next/link";

type CustomerSummary = {
  id: string;
  name: string;
  code: string | null;
  city: string | null;
};

type RouteItem = CustomerSummary & {
  status: "PENDING" | "VISITING" | "COMPLETED";
};

type RoutePlanItem = {
  id: string;
  customerId: string;
  sortOrder: number;
  status: string;
  customer: CustomerSummary;
};

type RoutePlan = {
  id: string;
  date: string;
  status: string;
  items: RoutePlanItem[];
};

type RouteTodaySectionProps = {
  routePlan?: RoutePlan | null;
  activeCustomers: CustomerSummary[];
};

function getStorageKey(): string {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  return `today_journey_plan_${yyyy}-${mm}-${dd}`;
}

export function RouteTodaySection({ routePlan, activeCustomers }: RouteTodaySectionProps) {
  const [localPlan, setLocalPlan] = useState<RouteItem[]>(() => {
    if (typeof window !== "undefined") {
      const key = getStorageKey();
      const saved = localStorage.getItem(key);
      if (saved) return JSON.parse(saved) as RouteItem[];
    }
    return [];
  });

  useEffect(() => {
    const handleStorageChange = () => {
      const key = getStorageKey();
      const saved = localStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved) as RouteItem[];
        setLocalPlan((prev) => {
          if (JSON.stringify(prev) !== JSON.stringify(parsed)) {
            return parsed;
          }
          return prev;
        });
      }
    };

    window.addEventListener("storage", handleStorageChange);
    const interval = setInterval(handleStorageChange, 2000);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      clearInterval(interval);
    };
  }, []);

  // Server route takes priority over local
  const journeyPlan: RouteItem[] = useMemo(() => {
    if (routePlan?.items && routePlan.items.length > 0) {
      return routePlan.items.map((item) => ({
        id: item.customerId,
        name: item.customer.name,
        code: item.customer.code,
        city: item.customer.city,
        status: item.status as RouteItem["status"],
      }));
    }
    return localPlan;
  }, [routePlan, localPlan]);

  const stats = useMemo(() => {
    const total = journeyPlan.length;
    const completed = journeyPlan.filter((j) => j.status === "COMPLETED").length;
    const visiting = journeyPlan.filter((j) => j.status === "VISITING").length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { total, completed, visiting, percent };
  }, [journeyPlan]);

  if (activeCustomers.length === 0 && journeyPlan.length === 0) return null;

  return (
    <div className="border rounded-2xl p-4 bg-card shadow-sm space-y-4">
      {/* Header & Progress */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Route className="h-5 w-5 text-primary" />
            <h3 className="font-bold text-sm text-foreground">Rute Hari Ini</h3>
          </div>
          {journeyPlan.length > 0 ? (
            <span className="text-xs font-semibold text-muted-foreground">
              {stats.completed}/{stats.total} Toko
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">Dari admin</span>
          )}
        </div>

        {journeyPlan.length > 0 ? (
          <>
            {/* Progress Bar */}
            <div className="space-y-1">
              <Progress value={stats.percent} className="h-2" />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>Progres Rute</span>
                <span>{stats.percent}% Selesai</span>
              </div>
            </div>
          </>
        ) : (
          <div className="p-4 rounded-xl bg-muted/30 text-center">
            <Route className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-50" />
            <p className="text-sm font-medium text-muted-foreground">Belum ada rute dari admin</p>
            <p className="text-[11px] text-muted-foreground/70 mt-1">Hubungi supervisor untuk mengatur rute harian</p>
          </div>
        )}
      </div>

      {/* Route List */}
      {journeyPlan.length > 0 && (
        <div className="space-y-2.5">
          {journeyPlan.map((item, index) => {
            const isCompleted = item.status === "COMPLETED";
            const isVisiting = item.status === "VISITING";

            return (
              <Link
                key={item.id}
                href={`/field/sales/customers/${item.id}`}
                className={`flex items-center justify-between p-3 border rounded-xl active:scale-[0.98] transition-all min-h-[48px] ${
                  isVisiting
                    ? "border-blue-200 bg-blue-50/20 dark:border-blue-900/30 dark:bg-blue-950/10"
                    : isCompleted
                    ? "border-emerald-100 bg-emerald-50/10 dark:border-emerald-900/10"
                    : "border-border bg-card"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {isCompleted ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                  ) : isVisiting ? (
                    <span className="relative flex h-5 w-5 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-5 w-5 bg-blue-500 items-center justify-center text-[10px] text-white font-bold">
                        {index + 1}
                      </span>
                    </span>
                  ) : (
                    <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30 flex items-center justify-center text-[10px] text-muted-foreground/75 font-bold shrink-0">
                      {index + 1}
                    </div>
                  )}

                  <div className="min-w-0">
                    <h4 className={`font-semibold text-sm truncate ${isCompleted ? "text-muted-foreground line-through" : "text-foreground"}`}>
                      {item.name}
                    </h4>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-muted-foreground">{item.code || "-"}</span>
                      {item.city && (
                        <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                          <MapPin className="h-2.5 w-2.5" />
                          {item.city}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {isVisiting && (
                    <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 animate-pulse uppercase tracking-wider">
                      Sedang Dikunjungi
                    </span>
                  )}
                  {isCompleted && (
                    <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                      Selesai
                    </span>
                  )}
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
