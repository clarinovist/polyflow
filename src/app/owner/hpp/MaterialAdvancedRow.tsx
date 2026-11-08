'use client';

import { Input } from '@/components/ui/input';
import type {
    OwnerHppMaterial,
    OwnerHppStage,
} from '@/lib/owner-hpp/workspace-schema';
import { NumberField } from './NumberField';
import { SELECT_CLASS } from './ui-classes';

interface MaterialAdvancedRowProps {
    material: OwnerHppMaterial;
    /** Stages this row may point at (no cycles), plus its current source. */
    upstreamOptions: readonly OwnerHppStage[];
    onChange: (patch: Record<string, string | number | null>) => void;
}

/** The per-material fields the simple card hides: unit/source and scrap. */
export function MaterialAdvancedRow({
    material,
    upstreamOptions,
    onChange,
}: MaterialAdvancedRowProps) {
    return (
        <div className="grid grid-cols-2 gap-2 rounded-md border p-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] sm:items-end">
            {material.kind === 'stage' ? (
                <label className="flex min-w-0 flex-col gap-1">
                    <span className="text-xs text-muted-foreground">
                        Dari tahap
                    </span>
                    <select
                        aria-label="Dari tahap"
                        className={SELECT_CLASS}
                        value={material.from}
                        onChange={(event) =>
                            onChange({ from: event.target.value })
                        }
                    >
                        {upstreamOptions.map((stage) => (
                            <option key={stage.id} value={stage.id}>
                                {stage.name}
                            </option>
                        ))}
                    </select>
                </label>
            ) : (
                <label className="flex min-w-0 flex-col gap-1">
                    <span className="truncate text-xs text-muted-foreground">
                        Satuan · {material.name}
                    </span>
                    <Input
                        aria-label="Satuan"
                        maxLength={16}
                        value={material.unit}
                        onChange={(event) =>
                            onChange({ unit: event.target.value })
                        }
                    />
                </label>
            )}
            <NumberField
                label="Susut %"
                showLabel
                value={material.scrapPercent}
                onChange={(scrapPercent) => onChange({ scrapPercent })}
            />
        </div>
    );
}
