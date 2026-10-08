'use client';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
export interface ActiveFilterChip {
    id: string;
    label: string;
}
export function ActiveFilterChips({
    filters,
    onRemove,
    onReset,
}: {
    filters: readonly ActiveFilterChip[];
    onRemove: (id: string) => void;
    onReset?: () => void;
}) {
    if (filters.length === 0) return null;
    return (
        <div
            aria-label="Filter aktif"
            className="flex flex-wrap items-center gap-2"
        >
            {filters.map((f) => (
                <Button
                    key={f.id}
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => onRemove(f.id)}
                    aria-label={'Hapus filter ' + f.label}
                    className="h-9 max-w-full"
                >
                    <span className="truncate">{f.label}</span>
                    <X aria-hidden="true" className="h-3.5 w-3.5" />
                </Button>
            ))}
            {onReset && (
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onReset}
                >
                    Reset semua
                </Button>
            )}
        </div>
    );
}
