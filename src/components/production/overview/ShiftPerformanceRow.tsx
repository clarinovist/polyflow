'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sun, Sunset, Moon, Users, Trash2, ArrowRight } from 'lucide-react';
import Link from 'next/link';

interface ShiftData {
  name: string;
  output: number;
  operators: number;
  scrap: number;
}

interface ShiftPerformanceRowProps {
  shifts: ShiftData[];
}

export function ShiftPerformanceRow({ shifts }: ShiftPerformanceRowProps) {
  // Ensure we display Pagi, Siang, Malam
  const getIcon = (name: string) => {
    const n = name.toLowerCase();
    if (n.includes('pagi')) return <Sun className="h-5 w-5 text-amber-500" />;
    if (n.includes('siang') || n.includes('sore')) return <Sunset className="h-5 w-5 text-orange-500" />;
    return <Moon className="h-5 w-5 text-indigo-500" />;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold tracking-tight">Kinerja Shift Hari Ini</h3>
          <p className="text-xs text-muted-foreground">Ringkasan output dan tingkat cacat material per shift berjalan.</p>
        </div>
        <Link href="/production/shifts">
          <Button variant="ghost" size="sm" className="font-bold flex items-center gap-1 text-primary">
            Riwayat Shift
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {shifts.map((s, index) => (
          <Card key={index} className="shadow-sm border bg-card/65 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="space-y-0.5">
                <CardTitle className="text-sm font-bold uppercase tracking-wider">{s.name}</CardTitle>
                <CardDescription className="text-[10px]">Hari ini</CardDescription>
              </div>
              <div className="p-2 rounded-full bg-zinc-100 dark:bg-zinc-900 border">
                {getIcon(s.name)}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Output</span>
                <div className="text-2xl font-black">{s.output.toLocaleString('id-ID')} unit</div>
              </div>
              
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-200/40 dark:border-zinc-800/40 text-xs">
                <div className="flex items-center gap-1.5 text-muted-foreground font-medium">
                  <Users className="h-3.5 w-3.5" />
                  <span>{s.operators} Operator</span>
                </div>
                <div className="flex items-center gap-1.5 text-rose-500 font-medium justify-end">
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>{s.scrap.toLocaleString('id-ID')} scrap</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
