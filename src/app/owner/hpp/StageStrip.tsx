'use client';

import { Button } from '@/components/ui/button';
import type { ScenarioResult } from '@/lib/owner-hpp/calculate-chain';
import type { OwnerHppScenario } from '@/lib/owner-hpp/workspace-schema';
import { OWNER_HPP_LIMITS } from '@/lib/owner-hpp/workspace-schema';
import { cn, formatRupiah } from '@/lib/utils/utils';
import { Plus } from 'lucide-react';

interface StageStripProps {
    scenario: OwnerHppScenario;
    result: ScenarioResult;
    activeStageId: string;
    onSelect: (stageId: string) => void;
    onAdd: () => void;
}

/** Stages in the order they are made; each chip shows that stage's HPP. */
export function StageStrip({
    scenario,
    result,
    activeStageId,
    onSelect,
    onAdd,
}: StageStripProps) {
    const hppById = new Map(
        result.stages.map((stage) => [stage.stageId, stage.hppPerOutput]),
    );
    const ordered =
        result.stages.length > 0
            ? result.stages.map(
                  (stage) =>
                      scenario.stages.find((s) => s.id === stage.stageId)!,
              )
            : scenario.stages;
    return (
        <nav
            aria-label="Tahap produksi"
            className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 md:mx-0 md:px-0"
        >
            {ordered.map((stage) => {
                const hpp = hppById.get(stage.id);
                const isActive = stage.id === activeStageId;
                return (
                    <button
                        key={stage.id}
                        type="button"
                        aria-current={isActive ? 'true' : undefined}
                        onClick={() => onSelect(stage.id)}
                        className={cn(
                            'flex min-h-11 min-w-28 shrink-0 flex-col items-start rounded-md border px-3 py-1.5 text-left',
                            isActive
                                ? 'border-foreground border-2 bg-card'
                                : 'bg-transparent text-muted-foreground',
                        )}
                    >
                        <span className="max-w-40 truncate text-sm font-medium">
                            {stage.name}
                            {stage.id === scenario.finalStageId
                                ? ' · akhir'
                                : ''}
                        </span>
                        <span className="font-mono text-xs tabular-nums">
                            {hpp === null || hpp === undefined
                                ? '-'
                                : formatRupiah(hpp)}
                        </span>
                    </button>
                );
            })}
            <Button
                type="button"
                variant="outline"
                className="min-h-11 shrink-0 border-dashed"
                disabled={scenario.stages.length >= OWNER_HPP_LIMITS.maxStages}
                onClick={onAdd}
            >
                <Plus /> Tahap
            </Button>
        </nav>
    );
}
