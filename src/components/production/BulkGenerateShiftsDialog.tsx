'use client';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarPlus } from 'lucide-react';
import { toast } from 'sonner';
import { addProductionShift } from '@/actions/production/production';
import { buildBulkShiftRows, partitionBulkShiftRows } from '@/lib/production/shift-bulk';
import { formatWIB } from '@/lib/utils/timezone';
interface BulkTemplate { id: string; name: string; startTime: string; endTime: string; status: string; }
interface BulkOperator { id: string; name: string | null; code: string; }
interface BulkDialogProps { orderId: string; existingStartMs: number[]; templates: BulkTemplate[]; operators: BulkOperator[]; }
function todayLocal(): string {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + mm + '-' + dd;
}
export function BulkGenerateShiftsDialog(props: BulkDialogProps) {
    const orderId = props.orderId;
    const existingStartMs = props.existingStartMs;
    const templates = props.templates;
    const operators = props.operators;
    const activeTemplates = templates.filter(isActiveTemplate);
    function isActiveTemplate(t: BulkTemplate) { return t.status === 'ACTIVE'; }
    const [open, setOpen] = useState(false);
    const [startDate, setStartDate] = useState(todayLocal());
    const [dayCount, setDayCount] = useState('3');
    const [checked, setChecked] = useState<Record<string, boolean>>(function () {
        const init: Record<string, boolean> = {};
        activeTemplates.forEach(function (t) { init[t.id] = true; });
        return init;
    });
    const [operatorByTemplate, setOperatorByTemplate] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(false);
    const chosen = activeTemplates.filter(function (t) { return checked[t.id]; });
    let freshRows: { templateId: string; shiftName: string; start: Date; end: Date }[] = [];
    let skippedCount = 0;
    let previewError: string | null = null;
    try {
        const days = Number.parseInt(dayCount, 10);
        const rows = buildBulkShiftRows(startDate, days, chosen);
        const part = partitionBulkShiftRows(rows, existingStartMs);
        freshRows = part.fresh;
        skippedCount = part.skipped.length;
    } catch (e) {
        previewError = e instanceof Error ? e.message : 'Input tidak valid';
    }
    async function onGenerate() {
        if (freshRows.length === 0) {
            toast.info('Tidak ada shift baru — semua sudah ada.');
            return;
        }
        setLoading(true);
        let ok = 0;
        let fail = 0;
        for (const row of freshRows) {
            const op = operatorByTemplate[row.templateId];
            const picked = op && op !== 'none' ? op : undefined;
            const result = await addProductionShift({
                productionOrderId: orderId,
                shiftName: row.shiftName,
                startTime: row.start,
                endTime: row.end,
                operatorId: picked,
            });
            if (result.success) { ok = ok + 1; } else { fail = fail + 1; }
        }
        setLoading(false);
        if (fail === 0) {
            toast.success('Berhasil membuat ' + ok + ' shift' + (skippedCount > 0 ? ', ' + skippedCount + ' dilewati (sudah ada).' : '.'));
            setOpen(false);
        } else {
            toast.error('Sebagian gagal', { description: ok + ' berhasil, ' + fail + ' gagal.' });
        }
    }
    const rangeText = freshRows.length > 0
        ? ' (' + formatWIB(freshRows[0].start, 'dd MMM') + ' s/d ' + formatWIB(freshRows[freshRows.length - 1].start, 'dd MMM') + ')'
        : '';
    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="gap-2">
                    <CalendarPlus className="h-4 w-4" />
                    Generate N hari
                </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Generate shift beberapa hari</DialogTitle>
                </DialogHeader>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="bulk-start-date">Tanggal mulai</Label>
                        <Input id="bulk-start-date" type="date" value={startDate} onChange={function (e) { setStartDate(e.target.value); }} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="bulk-day-count">Jumlah hari</Label>
                        <Input id="bulk-day-count" type="number" min={1} max={31} value={dayCount} onChange={function (e) { setDayCount(e.target.value); }} />
                    </div>
                </div>
                <div className="space-y-2">
                    {activeTemplates.map(function (t) {
                        return (
                            <div key={t.id} className="flex items-center gap-2 rounded-md border p-2">
                                <Checkbox checked={checked[t.id] === true} onCheckedChange={function (v) { setChecked(function (p) { return { ...p, [t.id]: v === true }; }); }} />
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium">{t.name} ({t.startTime}-{t.endTime})</p>
                                    <Select value={operatorByTemplate[t.id] || 'none'} onValueChange={function (v) { setOperatorByTemplate(function (p) { return { ...p, [t.id]: v }; }); }}>
                                        <SelectTrigger className="mt-1 h-8 text-xs">
                                            <SelectValue placeholder="Operator" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">Tanpa operator tetap</SelectItem>
                                            {operators.map(function (op) {
                                                return (
                                                    <SelectItem key={op.id} value={op.id}>
                                                        {op.name} ({op.code})
                                                    </SelectItem>
                                                );
                                            })}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        );
                    })}
                    {activeTemplates.length === 0 && (
                        <p className="text-xs text-muted-foreground">Tidak ada template shift aktif.</p>
                    )}
                </div>
                {previewError ? (
                    <p className="text-xs text-destructive">{previewError}</p>
                ) : (
                    <p className="text-xs text-muted-foreground">
                        Akan dibuat: {freshRows.length} shift{rangeText}
                        {skippedCount > 0 ? ' • ' + skippedCount + ' dilewati (sudah ada)' : ''}
                    </p>
                )}
                <DialogFooter>
                    <Button onClick={onGenerate} disabled={loading || freshRows.length === 0}>
                        {loading ? 'Membuat...' : 'Buat ' + freshRows.length + ' shift'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
