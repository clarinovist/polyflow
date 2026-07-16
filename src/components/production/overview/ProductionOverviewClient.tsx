'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import { getProductionLiveOverview } from '@/actions/dashboard/production-live-overview';
import { LiveClockBar } from './LiveClockBar';
import { TodayPulseCards } from './TodayPulseCards';
import { HourlyOutputChart } from './HourlyOutputChart';
import { FloorLiveGrid } from './FloorLiveGrid';
import { AttentionFeed } from './AttentionFeed';
import { RunningOrdersTable } from './RunningOrdersTable';
import { ShiftPerformanceRow } from './ShiftPerformanceRow';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ProductionOverviewData {
  pulse: {
    outputToday: number;
    outputYesterday: number;
    targetToday: number;
    runRateLastHour: number;
    activeJobs: number;
    released: number;
    waiting: number;
    yieldToday: number;
    scrapToday: number;
    qcPassRateToday: number;
    downtimeOpenCount: number;
  };
  hourly: { hour: number; today: number; avg7d: number }[];
  machines: {
    id: string;
    code: string;
    status: string;
    locationName: string;
    live: boolean;
    productName?: string;
    operatorName?: string;
    outputThisHour?: number;
    idleMinutes?: number;
  }[];
  attentions: {
    type: 'downtime' | 'waiting_material' | 'issue' | 'no_operator' | 'late' | 'high_scrap';
    severity: 'red' | 'amber';
    title: string;
    subtitle: string;
    orderId?: string;
    machineId?: string;
    ageMinutes: number;
  }[];
  runningOrders: {
    id: string;
    orderNumber: string;
    productName: string;
    machineCode: string;
    operatorName: string;
    plannedQty: number;
    actualQty: number;
    progress: number;
    isLate: boolean;
    startedAt: string | Date;
    estimatedDoneAt: string | Date | null;
  }[];
  shiftsToday: {
    name: string;
    output: number;
    operators: number;
    scrap: number;
  }[];
}

interface ProductionOverviewClientProps {
  initialData: ProductionOverviewData;
}

export function ProductionOverviewClient({ initialData }: ProductionOverviewClientProps) {
  const [lastUpdated, setLastUpdated] = useState<Date | null>(new Date());

  const fetcher = async (): Promise<ProductionOverviewData> => {
    const res = await getProductionLiveOverview();
    if (res.success && res.data) {
      setLastUpdated(new Date());
      return res.data as unknown as ProductionOverviewData;
    }
    const errorMsg = !res.success ? res.error : 'Failed to fetch live overview';
    throw new Error(errorMsg);
  };

  const { data, error, isLoading, mutate } = useSWR<ProductionOverviewData>('production-live-overview', fetcher, {
    fallbackData: initialData,
    refreshInterval: 30000,
    dedupingInterval: 25000,
    revalidateOnFocus: true,
  });

  const handleRefresh = async () => {
    await mutate();
  };

  if (error && !data) {
    return (
      <div className="flex flex-col items-center justify-center p-8 border border-dashed rounded-xl text-center min-h-[300px]">
        <AlertCircle className="h-10 w-10 text-rose-500 mb-3" />
        <h3 className="font-bold text-lg text-zinc-950 dark:text-zinc-50">Gagal memuat dashboard</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-md">
          {error.message || 'Terjadi kesalahan koneksi saat memuat data lantai produksi.'}
        </p>
        <Button onClick={handleRefresh} className="mt-4 font-bold">
          Coba Lagi
        </Button>
      </div>
    );
  }

  const activeData = data || initialData;

  return (
    <div className="flex flex-col gap-6">
      {/* Live Header Bar */}
      <LiveClockBar
        onRefresh={handleRefresh}
        isLoading={isLoading}
        lastUpdated={lastUpdated}
      />

      {/* Row 1: Today Pulse KPI cards */}
      <TodayPulseCards pulse={activeData.pulse} />

      {/* Row 2: Hourly Output Chart */}
      <HourlyOutputChart data={activeData.hourly} />

      {/* Row 3: Floor Live Mini & Attention Feed (60/40 Split) */}
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <FloorLiveGrid machines={activeData.machines} />
        </div>
        <div className="lg:col-span-2">
          <AttentionFeed attentions={activeData.attentions} />
        </div>
      </div>

      {/* Row 4: SPK Berjalan Table */}
      <RunningOrdersTable orders={activeData.runningOrders} />

      {/* Row 5: Shift Performance today */}
      <ShiftPerformanceRow shifts={activeData.shiftsToday} />
    </div>
  );
}
