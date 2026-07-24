"use client";

import { useState, useEffect, useMemo } from "react";
import { CheckCircle2, Navigation2, MapPin, ChevronRight } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import Link from "next/link";

type CustomerSummary = {
  id: string;
  name: string;
  code: string | null;
  city: string | null;
};

type JourneyItem = CustomerSummary & {
  status: "PENDING" | "VISITING" | "COMPLETED";
};

type DailyJourneyPlanProps = {
  activeCustomers: CustomerSummary[];
};

export function DailyJourneyPlan({ activeCustomers }: DailyJourneyPlanProps) {
  const [journeyPlan, setJourneyPlan] = useState<JourneyItem[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("today_journey_plan");
      if (saved) return JSON.parse(saved) as JourneyItem[];
    }
    return [];
  });

  // Initialize journey plan if not yet seeded
  useEffect(() => {
    if (journeyPlan.length === 0 && activeCustomers.length > 0) {
      // Seed a default 4-customer call plan for today from the active customers list
      const seeded: JourneyItem[] = activeCustomers.slice(0, 4).map((c) => ({
        ...c,
        status: "PENDING",
      }));
      localStorage.setItem("today_journey_plan", JSON.stringify(seeded));
      setTimeout(() => {
        setJourneyPlan(seeded);
      }, 0);
    }
  }, [activeCustomers, journeyPlan.length]);

  // Sync state with localStorage if checked-in/out in customer detail page
  useEffect(() => {
    const handleStorageChange = () => {
      const saved = localStorage.getItem("today_journey_plan");
      if (saved) {
        const parsed = JSON.parse(saved) as JourneyItem[];
        setJourneyPlan((prev) => {
          if (JSON.stringify(prev) !== JSON.stringify(parsed)) {
            return parsed;
          }
          return prev;
        });
      }
    };

    window.addEventListener("storage", handleStorageChange);
    // Poll local changes (since storage event only fires on other windows)
    const interval = setInterval(handleStorageChange, 2000);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      clearInterval(interval);
    };
  }, []);

  // Compute stats
  const stats = useMemo(() => {
    const total = journeyPlan.length;
    const completed = journeyPlan.filter((j) => j.status === "COMPLETED").length;
    const visiting = journeyPlan.filter((j) => j.status === "VISITING").length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { total, completed, visiting, percent };
  }, [journeyPlan]);

  if (activeCustomers.length === 0) return null;

  return (
    <div className="border rounded-2xl p-4 bg-card shadow-sm space-y-4">
      {/* Header & Progress */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Navigation2 className="h-5 w-5 text-primary rotate-45" />
            <h3 className="font-bold text-sm text-foreground">Rute Kunjungan Hari Ini</h3>
          </div>
          <span className="text-xs font-semibold text-muted-foreground">
            {stats.completed}/{stats.total} Toko
          </span>
        </div>

        {/* Progress Bar */}
        <div className="space-y-1">
          <Progress value={stats.percent} className="h-2" />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>Progres Rute</span>
            <span>{stats.percent}% Selesai</span>
          </div>
        </div>
      </div>

      {/* Journey Plan List */}
      <div className="space-y-2.5">
        {journeyPlan.map((item, index) => {
          const isCompleted = item.status === "COMPLETED";
          const isVisiting = item.status === "VISITING";

          return (
            <Link
              key={item.id}
              href={`/field/sales/customers/${item.id}`}
              className={`flex items-center justify-between p-3 border rounded-xl active:scale-[0.98] transition-all ${
                isVisiting
                  ? "border-blue-200 bg-blue-50/20 dark:border-blue-900/30 dark:bg-blue-950/10"
                  : isCompleted
                  ? "border-emerald-100 bg-emerald-50/10 dark:border-emerald-900/10"
                  : "border-border bg-card"
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                {/* Status Indicator Icon */}
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
    </div>
  );
}
