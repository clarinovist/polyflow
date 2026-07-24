"use client";

import { useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChevronDown, Camera, Clock, User, AlertTriangle, ExternalLink,
  List, LayoutList, Download, Users, Leaf, Scissors,
} from "lucide-react";
import { formatWIB } from "@/lib/utils/timezone";
import { cn } from "@/lib/utils/utils";
import { PhotoGalleryDialog } from "./PhotoGalleryDialog";
import { VoidExecutionButton } from "./VoidExecutionButton";

interface ExecutionData {
  id: string;
  quantityProduced: number;
  scrapQuantity: number;
  scrapDaunQty: number;
  scrapProngkolQty: number;
  startTime: string | null;
  endTime: string | null;
  notes: string | null;
  photoUrl: string | null;
  status: string;
  enteredQuantity: number | null;
  enteredUnit: string | null;
  bruto: number | null;
  bobin: number | null;
  cekGram: string | null;
  operator: { name: string } | null;
  machine: { code: string } | null;
  shift: { shiftName: string; operator: { name: string } | null } | null;
  helpers: { name: string }[];
}

interface GroupData {
  productionOrder: {
    id: string;
    orderNumber: string;
    bom: {
      name: string;
      productVariant: { name: string; primaryUnit: string };
    };
  };
  executions: ExecutionData[];
  totalQuantity: number;
  totalScrap: number;
  latestEndTime: string | null;
  earliestEndTime: string | null;
  machineCodes: string[];
  operatorNames: string[];
  shiftNames: string[];
  photoCount: number;
}

interface ProductionHistoryClientProps {
  groups: GroupData[];
}

const ANOMALY_SCRAP_THRESHOLD = 5;

type AnomalyType = 'scrap_high' | 'qty_zero' | 'no_photo' | 'voided' | 'duration';

function getAnomalies(exec: ExecutionData, hasPhoto: boolean): AnomalyType[] {
  const anomalies: AnomalyType[] = [];
  if (exec.status === 'VOIDED') anomalies.push('voided');
  if (exec.quantityProduced === 0 && exec.status !== 'VOIDED') anomalies.push('qty_zero');
  if (!hasPhoto && exec.status !== 'VOIDED') anomalies.push('no_photo');
  if (exec.startTime && exec.endTime) {
    const diff = new Date(exec.endTime).getTime() - new Date(exec.startTime).getTime();
    if (diff < 0 || diff > 24 * 60 * 60 * 1000) anomalies.push('duration');
  }
  return anomalies;
}

function getGroupAnomalies(group: GroupData): AnomalyType[] {
  const total = group.totalQuantity + group.totalScrap;
  const scrapPct = total > 0 ? (group.totalScrap / total) * 100 : 0;
  const anomalies: AnomalyType[] = [];
  if (scrapPct > ANOMALY_SCRAP_THRESHOLD) anomalies.push('scrap_high');
  if (group.photoCount === 0) anomalies.push('no_photo');
  return anomalies;
}

function AnomalyBadge({ type }: { type: AnomalyType }) {
  const map: Record<AnomalyType, { label: string; cls: string }> = {
    scrap_high: { label: 'Scrap tinggi', cls: 'bg-destructive/10 text-destructive border-destructive/30' },
    qty_zero: { label: 'Qty 0', cls: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800' },
    no_photo: { label: 'Tanpa bukti', cls: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800' },
    voided: { label: 'Void', cls: 'bg-destructive/10 text-destructive border-destructive/30' },
    duration: { label: 'Data aneh', cls: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800' },
  };
  const { label, cls } = map[type];
  return <Badge variant="outline" className={cn("text-[9px] px-1 py-0", cls)}>{label}</Badge>;
}

function formatDuration(startIso: string | null, endIso: string | null): string {
  if (!startIso || !endIso) return '-';
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (isNaN(start) || isNaN(end) || end < start) return '-';
  const diffMs = end - start;
  const hours = Math.floor(diffMs / 3600000);
  const minutes = Math.floor((diffMs % 3600000) / 60000);
  if (hours > 0) return `${hours}j ${minutes}m`;
  return `${minutes}m`;
}

function MachineBadges({ codes }: { codes: string[] }) {
  if (codes.length === 0) return <span className="text-muted-foreground text-xs">-</span>;
  return (
    <div className="flex flex-wrap gap-1">
      <Badge variant="outline" className="text-[10px] bg-zinc-50 dark:bg-zinc-900/50 dark:border-zinc-800">
        {codes[0]}
      </Badge>
      {codes.length > 1 && (
        <Badge variant="outline" className="text-[10px] bg-zinc-50 dark:bg-zinc-900/50 dark:border-zinc-800">
          +{codes.length - 1}
        </Badge>
      )}
    </div>
  );
}

function OperatorNames({ names }: { names: string[] }) {
  if (names.length === 0) return <span className="text-muted-foreground text-xs">-</span>;
  const display = names.length <= 2 ? names.join(', ') : `${names[0]} +${names.length - 1}`;
  return <span className="text-xs truncate max-w-[120px]" title={names.join(', ')}>{display}</span>;
}

function toWibDayKey(isoStr: string | null): string {
  if (!isoStr) return 'unknown';
  const d = new Date(isoStr);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d);
  const get = (type: string) => parts.find(p => p.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function toWibDayLabel(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const date = new Date(y, m - 1, d);
  return `${days[date.getDay()]}, ${d} ${months[m - 1]} ${y}`;
}

function exportCsv(groups: GroupData[]) {
  const rows: string[] = ['Waktu Mulai,Waktu Selesai,Durasi,No. SPK,Produk,BOM,Mesin,Operator,Shift,Hasil,Scrap,Unit,Status,Foto,Notes'];
  for (const g of groups) {
    for (const e of g.executions) {
      const start = e.startTime ? formatWIB(e.startTime, 'yyyy-MM-dd HH:mm') : '';
      const end = e.endTime ? formatWIB(e.endTime, 'yyyy-MM-dd HH:mm') : '';
      const dur = formatDuration(e.startTime, e.endTime);
      const machine = e.machine?.code || '';
      const operator = e.shift?.operator?.name || e.operator?.name || '';
      const shift = e.shift?.shiftName || '';
      const foto = e.photoUrl ? 'Ya' : 'Tidak';
      const notes = (e.notes || '').replace(/"/g, '""');
      rows.push(`"${start}","${end}","${dur}","${g.productionOrder.orderNumber}","${g.productionOrder.bom.productVariant.name}","${g.productionOrder.bom.name}","${machine}","${operator}","${shift}",${e.quantityProduced},${e.scrapQuantity},"${g.productionOrder.bom.productVariant.primaryUnit}","${e.status}","${foto}","${notes}"`);
    }
  }
  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `log-hasil-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function ProductionHistoryClient({ groups }: ProductionHistoryClientProps) {
  const searchParams = useSearchParams();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'spk' | 'timeline'>('spk');

  const hasFilter = searchParams.has('from') || searchParams.has('q') || searchParams.has('hasScrap') || searchParams.has('missingPhoto') || searchParams.has('includeVoided') || searchParams.has('machineId') || searchParams.has('operatorId') || searchParams.has('shiftId') || searchParams.has('productVariantId');

  // Timeline mode: flatten all executions into day-grouped entries
  const timelineByDay = useMemo(() => {
    if (viewMode !== 'timeline') return [];
    const flat: { exec: ExecutionData; group: GroupData }[] = [];
    for (const g of groups) {
      for (const e of g.executions) {
        flat.push({ exec: e, group: g });
      }
    }
    flat.sort((a, b) => {
      const aEnd = a.exec.endTime || '';
      const bEnd = b.exec.endTime || '';
      return bEnd.localeCompare(aEnd);
    });

    const dayMap = new Map<string, { exec: ExecutionData; group: GroupData }[]>();
    for (const item of flat) {
      const key = toWibDayKey(item.exec.endTime);
      if (!dayMap.has(key)) dayMap.set(key, []);
      dayMap.get(key)!.push(item);
    }
    return Array.from(dayMap.entries());
  }, [groups, viewMode]);

  if (groups.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground italic space-y-1">
        {hasFilter ? (
          <>
            <p>Tidak ada entri cocok filter. Longgarkan produk/mesin/operator.</p>
            <p className="text-xs">Atau ubah rentang tanggal di atas.</p>
          </>
        ) : (
          <>
            <p>Belum ada log tercatat hari ini.</p>
            <p className="text-xs">Cek kiosk / SPK aktif, atau ubah rentang tanggal.</p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar: view mode + export */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Button
            variant={viewMode === 'spk' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-8 text-xs"
            onClick={() => setViewMode('spk')}
          >
            <List className="h-3.5 w-3.5 mr-1" />
            Per SPK
          </Button>
          <Button
            variant={viewMode === 'timeline' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-8 text-xs"
            onClick={() => setViewMode('timeline')}
          >
            <LayoutList className="h-3.5 w-3.5 mr-1" />
            Timeline
          </Button>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => exportCsv(groups)}
        >
          <Download className="h-3.5 w-3.5 mr-1" />
          Export CSV
        </Button>
      </div>

      {/* SPK Mode */}
      {viewMode === 'spk' && (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[30px]"></TableHead>
                <TableHead className="min-w-[140px]">Waktu</TableHead>
                <TableHead>No. SPK</TableHead>
                <TableHead>Produk</TableHead>
                <TableHead>Mesin</TableHead>
                <TableHead>Operator</TableHead>
                <TableHead>Shift</TableHead>
                <TableHead className="text-right">Hasil</TableHead>
                <TableHead className="text-right">Scrap</TableHead>
                <TableHead className="text-right">%</TableHead>
                <TableHead className="text-center">Entri</TableHead>
                <TableHead className="text-center w-[60px]">Bukti</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((group) => {
                const isExpanded = expandedId === group.productionOrder.id;
                const scrapPct = group.totalQuantity + group.totalScrap > 0
                  ? (group.totalScrap / (group.totalQuantity + group.totalScrap)) * 100
                  : null;
                const groupAnomalies = getGroupAnomalies(group);

                return (
                  <GroupRow
                    key={group.productionOrder.id}
                    group={group}
                    isExpanded={isExpanded}
                    scrapPct={scrapPct}
                    groupAnomalies={groupAnomalies}
                    onToggle={() => setExpandedId(isExpanded ? null : group.productionOrder.id)}
                  />
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Timeline Mode */}
      {viewMode === 'timeline' && (
        <div className="space-y-4">
          {timelineByDay.map(([dayKey, items]) => (
            <div key={dayKey}>
              <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b mb-2 py-2 px-3">
                <div className="text-xs font-bold text-muted-foreground">
                  {toWibDayLabel(dayKey)}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {items.length} entri
                </div>
              </div>
              <div className="space-y-1.5 px-1">
                {items.map(({ exec, group }) => (
                  <TimelineRow
                    key={exec.id}
                    exec={exec}
                    group={group}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── SPK Mode: GroupRow ──────────────────────────────────────────────

function GroupRow({
  group,
  isExpanded,
  scrapPct,
  groupAnomalies,
  onToggle,
}: {
  group: GroupData;
  isExpanded: boolean;
  scrapPct: number | null;
  groupAnomalies: AnomalyType[];
  onToggle: () => void;
}) {
  const unit = group.productionOrder.bom.productVariant.primaryUnit;
  const timeRange = group.earliestEndTime && group.latestEndTime
    ? `${formatWIB(group.earliestEndTime, 'dd MMM HH:mm')} – ${formatWIB(group.latestEndTime, 'HH:mm')}`
    : group.latestEndTime
    ? formatWIB(group.latestEndTime, 'dd MMM HH:mm')
    : '-';

  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-muted/50"
        onClick={onToggle}
      >
        <TableCell>
          <ChevronDown className={cn("h-4 w-4 transition-transform", isExpanded && "rotate-180")} />
        </TableCell>
        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
          {timeRange}
        </TableCell>
        <TableCell>
          <Link
            href={`/production/orders/${group.productionOrder.id}`}
            className="font-mono text-xs font-bold hover:underline inline-flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            {group.productionOrder.orderNumber}
            <ExternalLink className="h-3 w-3 opacity-50" />
          </Link>
        </TableCell>
        <TableCell>
          <div className="text-sm font-medium">{group.productionOrder.bom.productVariant.name}</div>
          <div className="text-[10px] text-muted-foreground">{group.productionOrder.bom.name}</div>
        </TableCell>
        <TableCell><MachineBadges codes={group.machineCodes} /></TableCell>
        <TableCell><OperatorNames names={group.operatorNames} /></TableCell>
        <TableCell className="text-xs">
          {group.shiftNames.length > 0 ? group.shiftNames.join(', ') : '-'}
        </TableCell>
        <TableCell className="text-right">
          <span className="font-bold text-emerald-600 dark:text-emerald-400">
            {group.totalQuantity.toLocaleString()}
          </span>
          <span className="text-[10px] ml-1 text-muted-foreground">{unit}</span>
        </TableCell>
        <TableCell className="text-right">
          {group.totalScrap > 0 ? (
            <span className="font-bold text-destructive">{group.totalScrap.toLocaleString()}</span>
          ) : (
            <span className="text-muted-foreground text-xs">0</span>
          )}
        </TableCell>
        <TableCell className="text-right text-xs">
          {scrapPct !== null ? (
            <span className={cn(scrapPct > ANOMALY_SCRAP_THRESHOLD ? "text-destructive font-bold" : "text-muted-foreground")}>
              {scrapPct.toFixed(1)}%
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </TableCell>
        <TableCell className="text-center">
          <Badge variant="secondary" className="text-[10px]">{group.executions.length}</Badge>
        </TableCell>
        <TableCell className="text-center">
          {group.photoCount > 0 ? (
            <div onClick={(e) => e.stopPropagation()}>
              <PhotoGalleryDialog
                executions={group.executions.filter(e => e.photoUrl).map((e) => ({
                  id: e.id,
                  photoUrl: e.photoUrl,
                  quantityProduced: Number(e.quantityProduced),
                  endTime: e.endTime,
                  notes: e.notes,
                }))}
                orderNumber={group.productionOrder.orderNumber}
              />
            </div>
          ) : (
            <span className="inline-flex items-center gap-1 text-amber-600 text-[10px]">
              <AlertTriangle className="h-3 w-3" /> 0
            </span>
          )}
        </TableCell>
      </TableRow>

      {isExpanded && (
        <TableRow>
          <TableCell colSpan={12} className="bg-muted/30 p-0">
            <div className="p-4 space-y-1">
              <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-2">
                Detail Log Output ({group.executions.length} entri)
                {groupAnomalies.length > 0 && (
                  <div className="flex gap-1">
                    {groupAnomalies.map(a => <AnomalyBadge key={a} type={a} />)}
                  </div>
                )}
              </div>
              {group.executions.map((exec, idx) => (
                <ExecutionDetailRow
                  key={exec.id}
                  exec={exec}
                  idx={idx}
                  unit={unit}
                  orderNumber={group.productionOrder.orderNumber}
                  productionOrderId={group.productionOrder.id}
                />
              ))}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

// ─── Execution Detail Row (expanded) ────────────────────────────────

function ExecutionDetailRow({
  exec,
  idx,
  unit,
  orderNumber,
  productionOrderId,
}: {
  exec: ExecutionData;
  idx: number;
  unit: string;
  orderNumber: string;
  productionOrderId: string;
}) {
  const hasPhoto = !!exec.photoUrl;
  const anomalies = getAnomalies(exec, hasPhoto);

  return (
    <div
      className={cn(
        "flex flex-col p-2.5 rounded-md text-sm gap-2",
        exec.status === "VOIDED"
          ? "bg-destructive/10 opacity-60 line-through"
          : "bg-background"
      )}
    >
      {/* Line 1: index, time, duration, operator, machine, shift, anomalies */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-muted-foreground w-6 text-right text-xs">#{idx + 1}</span>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {exec.startTime && exec.endTime
            ? `${formatWIB(exec.startTime, 'HH:mm')} – ${formatWIB(exec.endTime, 'HH:mm')}`
            : exec.endTime
            ? formatWIB(exec.endTime, 'dd MMM HH:mm')
            : '-'}
          <span className="text-[10px] text-muted-foreground/70 ml-1">
            ({formatDuration(exec.startTime, exec.endTime)})
          </span>
        </div>
        {exec.operator && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <User className="h-3 w-3" /> {exec.shift?.operator?.name || exec.operator.name}
          </div>
        )}
        {exec.machine && (
          <Badge variant="outline" className="text-[9px]">{exec.machine.code}</Badge>
        )}
        {exec.shift && (
          <Badge variant="outline" className="text-[9px] bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
            {exec.shift.shiftName}
          </Badge>
        )}
        {exec.helpers.length > 0 && (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground" title={exec.helpers.map(h => h.name).join(', ')}>
            <Users className="h-3 w-3" />
            {exec.helpers.length > 1 ? `${exec.helpers[0].name} +${exec.helpers.length - 1}` : exec.helpers[0].name}
          </div>
        )}
        {anomalies.map(a => <AnomalyBadge key={a} type={a} />)}
      </div>

      {/* Line 2: quantities, scrap breakdown, photo, notes, status, void */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Good qty */}
          <span className="font-bold text-emerald-600 dark:text-emerald-400 min-w-[60px]">
            {Number(exec.quantityProduced).toLocaleString()}{' '}
            <span className="text-[10px] font-normal">{unit}</span>
          </span>

          {/* Scrap total */}
          {exec.scrapQuantity > 0 && (
            <span className="text-destructive text-xs font-medium">
              -{Number(exec.scrapQuantity).toLocaleString()} scrap
            </span>
          )}

          {/* Scrap breakdown */}
          {exec.scrapDaunQty > 0 && (
            <span className="text-[10px] text-destructive/80 inline-flex items-center gap-0.5">
              <Leaf className="h-2.5 w-2.5" />{Number(exec.scrapDaunQty).toLocaleString()}
            </span>
          )}
          {exec.scrapProngkolQty > 0 && (
            <span className="text-[10px] text-destructive/80 inline-flex items-center gap-0.5">
              <Scissors className="h-2.5 w-2.5" />{Number(exec.scrapProngkolQty).toLocaleString()}
            </span>
          )}

          {/* Entered quantity (dual-unit) */}
          {exec.enteredQuantity !== null && (
            <span className="text-[10px] text-muted-foreground">
              Input: {exec.enteredQuantity.toLocaleString()} {exec.enteredUnit || ''}
            </span>
          )}

          {/* Floor fields */}
          {exec.bruto !== null && (
            <span className="text-[10px] text-muted-foreground">Bruto: {exec.bruto}</span>
          )}
          {exec.bobin !== null && (
            <span className="text-[10px] text-muted-foreground">Bobin: {exec.bobin}</span>
          )}
          {exec.cekGram && (
            <span className="text-[10px] text-muted-foreground">Cek Gram: {exec.cekGram}</span>
          )}

          {/* Photo */}
          {exec.photoUrl && (
            <div className="flex items-center gap-1 text-emerald-600">
              <Camera className="h-3.5 w-3.5" />
              <span className="text-[10px]">foto</span>
            </div>
          )}

          {/* Notes */}
          {exec.notes && (
            <span className="text-xs text-muted-foreground truncate max-w-[150px]" title={exec.notes}>
              {exec.notes}
            </span>
          )}

          {/* Voided badge */}
          {exec.status === "VOIDED" && (
            <Badge variant="destructive" className="h-4 text-[8px] uppercase px-1">Voided</Badge>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Link
            href={`/production/orders/${productionOrderId}`}
            className="text-[10px] text-primary hover:underline inline-flex items-center gap-0.5"
          >
            Buka SPK <ExternalLink className="h-2.5 w-2.5" />
          </Link>
          {exec.status !== 'VOIDED' && (
            <VoidExecutionButton
              executionId={exec.id}
              productionOrderId={productionOrderId}
              orderNumber={orderNumber}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Timeline Mode: TimelineRow ─────────────────────────────────────

function TimelineRow({ exec, group }: { exec: ExecutionData; group: GroupData }) {
  const unit = group.productionOrder.bom.productVariant.primaryUnit;
  const hasPhoto = !!exec.photoUrl;
  const anomalies = getAnomalies(exec, hasPhoto);
  const total = exec.quantityProduced + exec.scrapQuantity;
  const scrapPct = total > 0 ? (exec.scrapQuantity / total) * 100 : 0;

  return (
    <div
      className={cn(
        "flex items-center gap-3 p-2.5 rounded-md text-sm border",
        exec.status === "VOIDED"
          ? "bg-destructive/5 opacity-60 line-through border-destructive/20"
          : "bg-background hover:bg-muted/30 border-transparent"
      )}
    >
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0 min-w-[100px]">
        <Clock className="h-3 w-3" />
        {exec.endTime ? formatWIB(exec.endTime, 'HH:mm') : '-'}
        <span className="text-[10px] text-muted-foreground/70">
          ({formatDuration(exec.startTime, exec.endTime)})
        </span>
      </div>

      <Link
        href={`/production/orders/${group.productionOrder.id}`}
        className="font-mono text-xs font-bold hover:underline shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        {group.productionOrder.orderNumber}
      </Link>

      <div className="text-xs truncate max-w-[120px] shrink-0">
        {group.productionOrder.bom.productVariant.name}
      </div>

      {exec.machine && (
        <Badge variant="outline" className="text-[9px] shrink-0">{exec.machine.code}</Badge>
      )}

      {exec.operator && (
        <span className="text-xs text-muted-foreground truncate max-w-[80px] shrink-0">{exec.shift?.operator?.name || exec.operator.name}</span>
      )}

      <span className="font-bold text-emerald-600 dark:text-emerald-400 text-xs shrink-0">
        {Number(exec.quantityProduced).toLocaleString()} {unit}
      </span>

      {exec.scrapQuantity > 0 && (
        <span className="text-destructive text-xs shrink-0">
          -{Number(exec.scrapQuantity).toLocaleString()}
          {scrapPct > ANOMALY_SCRAP_THRESHOLD && (
            <span className="text-[9px] ml-0.5">({scrapPct.toFixed(0)}%)</span>
          )}
        </span>
      )}

      <div className="flex items-center gap-1 shrink-0">
        {anomalies.map(a => <AnomalyBadge key={a} type={a} />)}
      </div>

      {!hasPhoto && exec.status !== 'VOIDED' && (
        <span className="text-amber-600 shrink-0">
          <AlertTriangle className="h-3 w-3" />
        </span>
      )}

      {exec.photoUrl && (
        <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
          <PhotoGalleryDialog
            executions={[{
              id: exec.id,
              photoUrl: exec.photoUrl,
              quantityProduced: Number(exec.quantityProduced),
              endTime: exec.endTime,
              notes: exec.notes,
            }]}
            orderNumber={group.productionOrder.orderNumber}
          />
        </div>
      )}

      <div className="ml-auto shrink-0">
        {exec.status !== 'VOIDED' && (
          <VoidExecutionButton
            executionId={exec.id}
            productionOrderId={group.productionOrder.id}
            orderNumber={group.productionOrder.orderNumber}
          />
        )}
      </div>
    </div>
  );
}
