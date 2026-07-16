'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, Clock, ArrowRight, ShieldAlert, AlertTriangle, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

interface AttentionItem {
  type: 'downtime' | 'waiting_material' | 'issue' | 'no_operator' | 'late' | 'high_scrap';
  severity: 'red' | 'amber';
  title: string;
  subtitle: string;
  orderId?: string;
  machineId?: string;
  ageMinutes: number;
}

interface AttentionFeedProps {
  attentions: AttentionItem[];
}

export function AttentionFeed({ attentions }: AttentionFeedProps) {
  const formatAge = (mins: number) => {
    if (mins === 0) return 'Baru saja';
    if (mins < 60) return `${mins}m lalu`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}j lalu`;
  };

  return (
    <Card className="shadow-sm border bg-card/65 backdrop-blur-sm h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-bold tracking-tight flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-rose-500" />
          Attention Feed
        </CardTitle>
        <CardDescription>Isu penting yang butuh intervensi / perhatian kepala produksi.</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto max-h-[360px] pr-2">
        {attentions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 border border-dashed rounded-lg text-center h-full">
            <CheckCircle2 className="h-10 w-10 text-emerald-500 mb-2.5" />
            <p className="font-bold text-sm text-zinc-950 dark:text-zinc-50">Lantai Produksi Aman</p>
            <p className="text-xs text-muted-foreground mt-1">Tidak ada anomali atau isu yang terdeteksi.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {attentions.map((item, index) => {
              const isRed = item.severity === 'red';
              const targetUrl = item.orderId 
                ? `/production/orders/${item.orderId}` 
                : item.machineId 
                  ? `/production/machines/${item.machineId}` 
                  : `/production`;

              return (
                <div
                  key={index}
                  className={`flex items-start justify-between gap-3 p-3 rounded-lg border text-xs transition-all hover:bg-zinc-105 ${
                    isRed 
                      ? 'border-rose-500/20 bg-rose-500/5 dark:bg-rose-500/5' 
                      : 'border-amber-500/20 bg-amber-500/5 dark:bg-amber-500/5'
                  }`}
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div className="mt-0.5">
                      {isRed ? (
                        <AlertCircle className="h-4.5 w-4.5 text-rose-500" />
                      ) : (
                        <AlertTriangle className="h-4.5 w-4.5 text-amber-500" />
                      )}
                    </div>
                    <div className="space-y-1 min-w-0">
                      <p className="font-extrabold text-zinc-900 dark:text-zinc-50 truncate leading-none">
                        {item.title}
                      </p>
                      <p className="text-[11px] text-muted-foreground font-medium line-clamp-2">
                        {item.subtitle}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <span className="text-[10px] text-muted-foreground font-mono flex items-center gap-1 font-semibold">
                      <Clock className="h-3 w-3" />
                      {formatAge(item.ageMinutes)}
                    </span>
                    <Link href={targetUrl}>
                      <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50">
                        <ArrowRight className="h-3 w-3 text-muted-foreground hover:text-primary" />
                      </Button>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}


