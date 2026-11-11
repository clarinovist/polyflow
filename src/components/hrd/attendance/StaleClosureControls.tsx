'use client';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
    CLOSURE_MAX_BATCH,
    POLICY_OPTIONS,
    type ClosurePolicy,
} from './stale-closure-types';

interface Props {
    policy: ClosurePolicy;
    onPolicyChange: (policy: ClosurePolicy) => void;
    selectedCount: number;
    visibleCount: number;
    isAllSelected: boolean;
    onToggleAll: () => void;
    onPreview: () => void;
}

function limitNote(selectedCount: number, visibleCount: number): string | null {
    if (visibleCount <= CLOSURE_MAX_BATCH || selectedCount < CLOSURE_MAX_BATCH) {
        return null;
    }
    return `Hanya ${CLOSURE_MAX_BATCH} dari ${visibleCount} sesi yang dipilih (batas per koreksi). Terapkan dulu, lalu pilih sisanya.`;
}

function PolicyChoice({
    policy,
    onChange,
}: {
    policy: ClosurePolicy;
    onChange: (policy: ClosurePolicy) => void;
}) {
    return (
        <fieldset className="space-y-2">
            <legend className="text-xs font-semibold">
                Jam pulang yang diisi
            </legend>
            <RadioGroup value={policy} onValueChange={(v) => onChange(v as ClosurePolicy)}>
                {POLICY_OPTIONS.map((o) => (
                    <div key={o.value} className="flex items-start gap-2">
                        <RadioGroupItem
                            id={`closure-policy-${o.value}`}
                            value={o.value}
                            className="mt-0.5"
                        />
                        <div className="space-y-0.5">
                            <Label htmlFor={`closure-policy-${o.value}`}>
                                {o.label}
                            </Label>
                            <p className="text-xs text-muted-foreground">
                                {o.description}
                            </p>
                        </div>
                    </div>
                ))}
            </RadioGroup>
        </fieldset>
    );
}

/** Kontrol koreksi massal (hanya dirender untuk ADMIN/HRD oleh pemanggil). */
export function StaleClosureControls({
    policy,
    onPolicyChange,
    selectedCount,
    visibleCount,
    isAllSelected,
    onToggleAll,
    onPreview,
}: Props) {
    const note = limitNote(selectedCount, visibleCount);
    return (
        <div className="bg-card rounded-xl border p-3 space-y-3">
            <div className="flex items-center gap-2">
                <Checkbox
                    id="closure-select-all"
                    aria-label="Pilih semua yang tampil"
                    checked={isAllSelected}
                    onCheckedChange={onToggleAll}
                />
                <Label htmlFor="closure-select-all" className="text-xs">
                    Pilih semua yang tampil (maks. {CLOSURE_MAX_BATCH})
                </Label>
            </div>
            {note && (
                <p role="note" className="text-xs text-amber-600">
                    {note}
                </p>
            )}
            <PolicyChoice policy={policy} onChange={onPolicyChange} />
            <Button
                type="button"
                size="sm"
                disabled={selectedCount === 0}
                onClick={onPreview}
            >
                Pratinjau koreksi ({selectedCount})
            </Button>
        </div>
    );
}
