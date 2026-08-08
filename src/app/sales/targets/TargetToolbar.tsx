'use client';

import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Copy, Save, Loader2 } from 'lucide-react';
import { MONTH_NAMES } from './types';

/** Selector periode + aksi global (salin, simpan semua) — bar atas halaman. */
export function TargetToolbar({
    year,
    month,
    yearOptions,
    saving,
    loading,
    isDirty,
    editCount,
    onPeriodChange,
    onCopy,
    onBulkSave,
}: {
    year: number;
    month: number;
    yearOptions: number[];
    saving: boolean;
    loading: boolean;
    isDirty: boolean;
    editCount: number;
    onPeriodChange: (year: number, month: number) => void;
    onCopy: () => void;
    onBulkSave: () => void;
}) {
    return (
        <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
                <label className="text-[11px] font-semibold text-muted-foreground uppercase">
                    Tahun
                </label>
                <Select
                    value={String(year)}
                    onValueChange={(v) => onPeriodChange(Number(v), month)}
                >
                    <SelectTrigger className="h-9 w-[100px]">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {yearOptions.map((y) => (
                            <SelectItem key={y} value={String(y)}>
                                {y}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <div className="space-y-1">
                <label className="text-[11px] font-semibold text-muted-foreground uppercase">
                    Bulan
                </label>
                <Select
                    value={String(month)}
                    onValueChange={(v) => onPeriodChange(year, Number(v))}
                >
                    <SelectTrigger className="h-9 w-[140px]">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {MONTH_NAMES.map((name, idx) => (
                            <SelectItem key={idx} value={String(idx + 1)}>
                                {name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <Button
                variant="outline"
                size="sm"
                className="h-9"
                onClick={onCopy}
                disabled={saving || loading}
            >
                {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                    <Copy className="h-4 w-4 mr-1" />
                )}
                Salin dari bulan lalu
            </Button>
            <Button
                size="sm"
                className="h-9"
                onClick={onBulkSave}
                disabled={!isDirty || saving || loading}
            >
                {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                    <Save className="h-4 w-4 mr-1" />
                )}
                Simpan Semua {isDirty ? `(${editCount})` : ''}
            </Button>
        </div>
    );
}
