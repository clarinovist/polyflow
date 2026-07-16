'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Flame,
  CheckCircle2,
  Trash2,
  FileText
} from 'lucide-react';

interface PulseData {
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
}

interface TodayPulseCardsProps {
  pulse: PulseData;
}

export function TodayPulseCards({ pulse }: TodayPulseCardsProps) {
  const outputDiff = pulse.outputToday - pulse.outputYesterday;
  const hasYesterday = pulse.outputYesterday > 0;
  const outputPercentChange = hasYesterday ? (outputDiff / pulse.outputYesterday) * 100 : 0;

  const targetProgress = pulse.targetToday > 0
    ? Math.min(100, (pulse.outputToday / pulse.targetToday) * 100)
    : 0;

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
      {/* 1. Output Hari Ini */}
      <Card className="shadow-sm border-l-4 border-l-primary bg-card/65 backdrop-blur-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4">
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Output Hari Ini</CardTitle>
          <Activity className="h-4 w-4 text-primary animate-pulse" />
        </CardHeader>
        <CardContent className="pb-4">
          <div className="text-3xl font-extrabold tracking-tight">
            {pulse.outputToday.toLocaleString('id-ID')}
          </div>
          <div className="mt-1 flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground">
              Target: {pulse.targetToday.toLocaleString('id-ID')} ({targetProgress.toFixed(0)}%)
            </span>
            <Progress value={targetProgress} className="h-1 bg-zinc-200 dark:bg-zinc-800" />
            <div className="flex items-center gap-1 mt-1 text-[11px]">
              {!hasYesterday ? (
                <span className="text-muted-foreground text-[10px]">Data kemarin kosong</span>
              ) : outputDiff >= 0 ? (
                <>
                  <TrendingUp className="h-3 w-3 text-emerald-500" />
                  <span className="text-emerald-500 font-bold">+{outputPercentChange.toFixed(1)}%</span>
                  <span className="text-muted-foreground text-[10px]">vs kemarin</span>
                </>
              ) : (
                <>
                  <TrendingDown className="h-3 w-3 text-rose-500" />
                  <span className="text-rose-500 font-bold">{outputPercentChange.toFixed(1)}%</span>
                  <span className="text-muted-foreground text-[10px]">vs kemarin</span>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2. Run Rate / Jam */}
      <Card className="shadow-sm border-l-4 border-l-amber-500 bg-card/65 backdrop-blur-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4">
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Run Rate Jam Ini</CardTitle>
          <Flame className="h-4 w-4 text-amber-500" />
        </CardHeader>
        <CardContent className="pb-4">
          <div className="text-3xl font-extrabold tracking-tight">
            {pulse.runRateLastHour.toLocaleString('id-ID')}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            Total output dalam 60 menit terakhir.
          </p>
          <div className="mt-2 flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-ping" />
            <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">Live tracking</span>
          </div>
        </CardContent>
      </Card>

      {/* 3. Status SPK */}
      <Card className="shadow-sm border-l-4 border-l-blue-500 bg-card/65 backdrop-blur-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4">
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Status SPK</CardTitle>
          <FileText className="h-4 w-4 text-blue-500" />
        </CardHeader>
        <CardContent className="pb-4">
          <div className="text-3xl font-extrabold tracking-tight">
            {pulse.activeJobs} <span className="text-xs font-normal text-muted-foreground">berjalan</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Badge variant="outline" className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0 border-blue-500/20 text-blue-600 dark:text-blue-400 bg-blue-500/5">
              {pulse.released} Rilis
            </Badge>
            <Badge variant="outline" className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0 border-amber-500/20 text-amber-600 dark:text-amber-400 bg-amber-500/5">
              {pulse.waiting} Tunggu
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* 4. Yield Hari Ini */}
      <Card className="shadow-sm border-l-4 border-l-emerald-500 bg-card/65 backdrop-blur-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4">
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Yield Hari Ini</CardTitle>
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        </CardHeader>
        <CardContent className="pb-4">
          <div className="text-3xl font-extrabold tracking-tight">
            {pulse.yieldToday.toFixed(1)}%
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            Persentase aktual vs rencana pada SPK berjalan + selesai hari ini.
          </p>
          <Progress value={Math.min(100, pulse.yieldToday)} className="h-1 mt-2.5 bg-zinc-200 dark:bg-zinc-800" />
        </CardContent>
      </Card>

      {/* 5. Scrap & QC */}
      <Card className="shadow-sm border-l-4 border-l-rose-500 bg-card/65 backdrop-blur-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4">
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Scrap & Kualitas</CardTitle>
          <Trash2 className="h-4 w-4 text-rose-500" />
        </CardHeader>
        <CardContent className="pb-4">
          <div className="text-3xl font-extrabold tracking-tight text-rose-600 dark:text-rose-400">
            {pulse.scrapToday.toLocaleString('id-ID')} <span className="text-xs font-normal text-muted-foreground">scrap</span>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">QC Pass Rate:</span>
            <span className="text-[11px] font-black text-emerald-600 dark:text-emerald-400">
              {pulse.qcPassRateToday.toFixed(1)}%
            </span>
          </div>
          <div className="mt-2.5 h-1 w-full bg-zinc-200 dark:bg-zinc-800 rounded overflow-hidden">
            <div 
              className="h-full bg-emerald-500" 
              style={{ width: `${pulse.qcPassRateToday}%` }} 
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
