'use client';

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Clock, RefreshCw, Monitor, LayoutGrid } from 'lucide-react';
import Link from 'next/link';

interface LiveClockBarProps {
  onRefresh: () => void;
  isLoading: boolean;
  lastUpdated: Date | null;
}

const BUSINESS_TZ = 'Asia/Jakarta';

function formatWibClock(date: Date): string {
  const datePart = new Intl.DateTimeFormat('id-ID', {
    timeZone: BUSINESS_TZ,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
  const timePart = new Intl.DateTimeFormat('id-ID', {
    timeZone: BUSINESS_TZ,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
  return `${timePart} WIB • ${datePart}`;
}

function getWibHour(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TZ,
    hour: 'numeric',
    hour12: false,
  }).formatToParts(date);
  const v = parts.find((p) => p.type === 'hour')?.value;
  return v ? parseInt(v, 10) % 24 : 0;
}

function getShiftByHour(h: number): string {
  if (h >= 7 && h < 15) return 'Shift Pagi';
  if (h >= 15 && h < 23) return 'Shift Siang';
  return 'Shift Malam';
}

export function LiveClockBar({ onRefresh, isLoading, lastUpdated }: LiveClockBarProps) {
  const [time, setTime] = useState<Date>(() => new Date());
  const [secondsSinceUpdate, setSecondsSinceUpdate] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!lastUpdated) return;
    const base = lastUpdated.getTime();
    const updateElapsed = () => {
      const elapsed = Math.floor((Date.now() - base) / 1000);
      setSecondsSinceUpdate(elapsed);
    };
    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [lastUpdated]);

  const wibHour = getWibHour(time);
  const shiftLabel = getShiftByHour(wibHour);

  return (
    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-md shadow-sm">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
          <Clock className="h-5 w-5 animate-pulse" />
        </div>
        <div className="space-y-1">
          <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 font-mono">
            {formatWibClock(time)}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-none">
              {shiftLabel}
            </Badge>
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
              {isLoading ? 'Memperbarui...' : `Diperbarui ${secondsSinceUpdate} detik lalu • auto 30s`}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 self-stretch md:self-auto">
        <Button onClick={onRefresh} disabled={isLoading} variant="outline" size="sm" className="font-bold flex items-center gap-2 h-9">
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
        <Link href="/production/machines" className="flex-1 md:flex-initial">
          <Button variant="outline" size="sm" className="w-full font-bold flex items-center gap-2 h-9">
            <LayoutGrid className="h-4 w-4" />
            Papan Mesin
          </Button>
        </Link>
        <Link href="/kiosk" className="flex-1 md:flex-initial">
          <Button variant="default" size="sm" className="w-full font-bold flex items-center gap-2 h-9 bg-primary text-primary-foreground">
            <Monitor className="h-4 w-4" />
            Kiosk
          </Button>
        </Link>
      </div>
    </div>
  );
}
