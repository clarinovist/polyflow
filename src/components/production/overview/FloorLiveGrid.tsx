'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Settings, ArrowRight } from 'lucide-react';
import Link from 'next/link';

interface MachineData {
  id: string;
  code: string;
  status: string;
  locationName: string;
  live: boolean;
  productName?: string;
  operatorName?: string;
  outputThisHour?: number;
  idleMinutes?: number;
}

interface FloorLiveGridProps {
  machines: MachineData[];
}

export function FloorLiveGrid({ machines }: FloorLiveGridProps) {
  const displayedMachines = machines.slice(0, 12);
  const remainingCount = Math.max(0, machines.length - 12);
  const totalLabel = `${displayedMachines.length}/${machines.length}`;

  const formatIdleTime = (mins?: number) => {
    if (!mins) return '0m';
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hrs}j ${remainingMins}m`;
  };

  return (
    <Card className="shadow-sm border bg-card/65 backdrop-blur-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-lg font-bold tracking-tight flex items-center gap-2">
            Status Area Produksi (Floor Live)
            <span className="text-[10px] font-mono font-normal text-muted-foreground border rounded px-1.5 py-0.5">{totalLabel}</span>
          </CardTitle>
          <CardDescription>Status operasional mesin berjalan real-time.</CardDescription>
        </div>
        <Link href="/production/machines">
          <Button variant="ghost" size="sm" className="font-bold flex items-center gap-1 text-primary">
            Papan Detail
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        {machines.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 border border-dashed rounded-lg text-center">
            <Settings className="h-10 w-10 text-muted-foreground animate-spin mb-3" />
            <p className="font-bold text-sm text-zinc-950 dark:text-zinc-50">Belum ada mesin terdaftar</p>
            <p className="text-xs text-muted-foreground mt-1">Daftarkan mesin di pengaturan aset.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {displayedMachines.map((m) => {
                const isDowntime = m.status === 'DOWNTIME' || m.status === 'MAINTENANCE';
                
                return (
                  <div
                    key={m.id}
                    className={`p-3 rounded-lg border transition-all hover:shadow-md ${
                      m.live 
                        ? 'border-emerald-500/20 bg-emerald-500/5' 
                        : isDowntime 
                          ? 'border-rose-500/20 bg-rose-500/5' 
                          : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/20'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-black text-sm tracking-tight uppercase">{m.code}</span>
                      <div className="flex items-center gap-1">
                        <div 
                          className={`h-2 w-2 rounded-full ${
                            m.live 
                              ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]' 
                              : isDowntime 
                                ? 'bg-rose-500 animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.5)]' 
                                : 'bg-zinc-400 dark:bg-zinc-600'
                          }`}
                        />
                        <span className="text-[9px] uppercase font-bold text-muted-foreground">{m.status}</span>
                      </div>
                    </div>

                    <div className="text-[10px] text-muted-foreground truncate font-medium mb-2 leading-tight">
                      {m.locationName}
                    </div>

                    {m.productName ? (
                      <div className="p-1.5 rounded bg-zinc-100 dark:bg-zinc-900/60 border border-zinc-200/50 dark:border-zinc-800/60 mb-2">
                        <div className="text-[9px] text-muted-foreground font-semibold leading-none mb-0.5 uppercase tracking-wide">Produk</div>
                        <div className="text-[10px] font-bold text-zinc-900 dark:text-zinc-100 truncate">
                          {m.productName}
                        </div>
                      </div>
                    ) : (
                      <div className="h-[34px] flex items-center justify-center border border-dashed border-zinc-200 dark:border-zinc-850 rounded mb-2">
                        <span className="text-[9px] text-muted-foreground italic">Tidak Ada SPK</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-[10px] pt-1.5 border-t border-zinc-200/40 dark:border-zinc-800/40">
                      <div>
                        {m.operatorName ? (
                          <div className="flex items-center gap-1">
                            <span className="h-4 w-4 rounded-full bg-zinc-200 dark:bg-zinc-800 text-[8px] font-black flex items-center justify-center">
                              {m.operatorName.charAt(0)}
                            </span>
                            <span className="text-[9px] font-bold truncate max-w-[60px]">{m.operatorName}</span>
                          </div>
                        ) : (
                          <span className="text-rose-500 italic text-[9px] font-medium">Tanpa Operator</span>
                        )}
                      </div>

                      <div className="text-right">
                        {m.live ? (
                          <div className="flex flex-col">
                            <span className="text-[8px] text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-wider">Jam Ini</span>
                            <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">+{m.outputThisHour || 0}</span>
                          </div>
                        ) : (
                          <div className="flex flex-col">
                            <span className="text-[8px] text-muted-foreground uppercase tracking-wider">Idle</span>
                            <span className="font-mono text-muted-foreground">{formatIdleTime(m.idleMinutes)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {remainingCount > 0 && (
              <div className="text-center pt-2">
                <Link href="/production/machines">
                  <Button variant="outline" size="sm" className="font-bold text-xs">
                    Lihat {remainingCount} Mesin Lainnya...
                  </Button>
                </Link>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
