'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Play, Monitor } from 'lucide-react';
import Link from 'next/link';

interface RunningOrder {
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
}

interface RunningOrdersTableProps {
  orders: RunningOrder[];
}

export function RunningOrdersTable({ orders }: RunningOrdersTableProps) {
  const formatTime = (d: Date | null | string) => {
    if (!d) return '-';
    const dateObj = typeof d === 'string' ? new Date(d) : d;
    return dateObj.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const formatDate = (d: Date | null | string) => {
    if (!d) return '-';
    const dateObj = typeof d === 'string' ? new Date(d) : d;
    return dateObj.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
  };

  return (
    <Card className="shadow-sm border bg-card/65 backdrop-blur-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-lg font-bold tracking-tight">SPK Berjalan (Running Orders)</CardTitle>
          <CardDescription>Daftar Surat Perintah Kerja yang sedang beroperasi di lantai produksi.</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 border border-dashed rounded-lg text-center">
            <Play className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="font-bold text-sm text-zinc-950 dark:text-zinc-50">Tidak ada SPK berjalan</p>
            <p className="text-xs text-muted-foreground mt-1">Rilis dan mulai SPK dari Papan SPK.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-bold uppercase tracking-wider text-[10px]">SPK #</TableHead>
                  <TableHead className="font-bold uppercase tracking-wider text-[10px]">Produk</TableHead>
                  <TableHead className="font-bold uppercase tracking-wider text-[10px]">Mesin</TableHead>
                  <TableHead className="font-bold uppercase tracking-wider text-[10px]">Operator</TableHead>
                  <TableHead className="font-bold uppercase tracking-wider text-[10px] w-[200px]">Progress</TableHead>
                  <TableHead className="font-bold uppercase tracking-wider text-[10px]">Mulai</TableHead>
                  <TableHead className="font-bold uppercase tracking-wider text-[10px]">Est. Selesai</TableHead>
                  <TableHead className="font-bold uppercase tracking-wider text-[10px]">Status</TableHead>
                  <TableHead className="font-bold uppercase tracking-wider text-[10px] text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => (
                  <TableRow key={o.id} className="hover:bg-zinc-500/5">
                    <TableCell className="font-mono font-bold text-xs">{o.orderNumber}</TableCell>
                    <TableCell className="font-semibold text-xs max-w-[180px] truncate">{o.productName}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-extrabold uppercase text-[10px]">
                        {o.machineCode}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="h-5 w-5 rounded-full bg-zinc-200 dark:bg-zinc-800 text-[9px] font-black flex items-center justify-center">
                          {o.operatorName.charAt(0)}
                        </span>
                        <span className="font-medium">{o.operatorName}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] font-mono font-bold">
                          <span>{o.actualQty.toLocaleString('id-ID')} unit</span>
                          <span className="text-muted-foreground">/ {o.plannedQty.toLocaleString('id-ID')}</span>
                        </div>
                        <Progress value={Math.min(100, o.progress)} className="h-1.5" />
                      </div>
                    </TableCell>
                    <TableCell className="text-xs font-medium text-muted-foreground font-mono">
                      {formatTime(o.startedAt)}
                    </TableCell>
                    <TableCell className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 font-mono">
                      {o.estimatedDoneAt ? (
                        <div className="flex flex-col">
                          <span>{formatTime(o.estimatedDoneAt)}</span>
                          <span className="text-[9px] text-muted-foreground font-normal">{formatDate(o.estimatedDoneAt)}</span>
                        </div>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell>
                      {o.isLate ? (
                        <Badge variant="destructive" className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0">
                          Late
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0 border-emerald-500/20 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5">
                          On Track
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link href="/kiosk">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary">
                            <Monitor className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                        <Link href={`/production/orders/${o.id}`}>
                          <Button variant="outline" size="sm" className="font-bold text-[10px] h-7 px-2">
                            Detail
                          </Button>
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
