'use client';

import { Button } from '@/components/ui/button';
import type { ScenarioResult } from '@/lib/owner-hpp/calculate-chain';
import { formatRupiah } from '@/lib/utils/utils';
import { Save } from 'lucide-react';
import { formatPercent } from './format-result';

interface SaveControl {
    isDirty: boolean;
    isSaving: boolean;
    onSave: () => void;
}

export function SaveButton({
    isDirty,
    isSaving,
    onSave,
    className,
}: SaveControl & { className?: string }) {
    return (
        <Button
            type="button"
            className={className}
            onClick={onSave}
            disabled={isSaving || !isDirty}
        >
            <Save /> {isSaving ? 'Menyimpan…' : 'Simpan'}
        </Button>
    );
}

/** Phone only: HPP, margin and Simpan stay in reach at the bottom edge. */
export function SaveDock({
    result,
    ...save
}: SaveControl & { result: ScenarioResult }) {
    return (
        <div className="sticky bottom-0 z-20 -mx-3 grid grid-cols-[1fr_auto_auto] items-center gap-3 border-t bg-background px-3 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] md:-mx-6 md:px-6 lg:hidden">
            <div className="min-w-0">
                <p className="truncate text-xs text-muted-foreground">
                    HPP akhir per {result.finalUnit.toLowerCase() || 'satuan'}
                </p>
                <p className="font-mono text-xl font-semibold tabular-nums">
                    {result.finalHpp === null
                        ? '-'
                        : formatRupiah(result.finalHpp)}
                </p>
            </div>
            <div className="text-right">
                <p className="text-xs text-muted-foreground">Margin</p>
                <p className="font-mono text-base font-semibold tabular-nums">
                    {formatPercent(result.marginPercent)}
                </p>
            </div>
            <SaveButton className="min-h-11" {...save} />
        </div>
    );
}
