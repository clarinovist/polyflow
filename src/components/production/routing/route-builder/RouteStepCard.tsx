import type { RouteType } from './types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

type RouteStepCardProps = {
    step: RouteType['steps'][number];
    idx: number;
    hasIssue: boolean;
    bomPv: RouteType['steps'][number]['bom']['productVariant'];
    isDraft: boolean;
    sortedSteps: RouteType['steps'];
    handleMove: (idx: number, dir: -1 | 1) => Promise<void>;
    handleStartEdit: (step: RouteType['steps'][number]) => void;
    handleDeleteStep: (stepId: string) => Promise<void>;
};

export function RouteStepCard({
    step,
    idx,
    hasIssue,
    bomPv,
    isDraft,
    sortedSteps,
    handleMove,
    handleStartEdit,
    handleDeleteStep,
}: RouteStepCardProps) {
    return (
        <Card
            key={step.id}
            className={hasIssue ? 'border-red-300 bg-red-50/30' : ''}
        >
            <CardContent className="p-3.5 flex gap-3">
                <div className="font-bold text-lg w-7 shrink-0 text-muted-foreground">
                    #{idx + 1}
                </div>
                <div className="flex-1 space-y-2 min-w-0">
                    <div className="flex gap-2 items-center flex-wrap">
                        <span className="font-semibold truncate">
                            {step.label}
                        </span>
                        <Badge
                            variant="outline"
                            className="text-[11px] font-mono shrink-0"
                        >
                            {step.stepCode}
                        </Badge>
                        <Badge
                            variant="secondary"
                            className="text-[11px] shrink-0"
                        >
                            {step.process.code}
                        </Badge>
                        {step.process.requiresMachine && (
                            <Badge
                                variant="outline"
                                className="text-[10px] shrink-0"
                            >
                                butuh mesin
                            </Badge>
                        )}
                        {hasIssue && (
                            <Badge
                                variant="destructive"
                                className="text-[10px] shrink-0"
                            >
                                issue
                            </Badge>
                        )}
                    </div>
                    <div className="text-xs space-y-1">
                        <div className="flex gap-1.5 flex-wrap">
                            <span className="text-muted-foreground">
                                Proses:
                            </span>{' '}
                            <span className="font-medium">
                                {step.process.name}
                            </span>
                            <span className="text-muted-foreground">·</span>
                            <span className="text-muted-foreground">BOM:</span>
                            <span className="font-medium truncate">
                                {step.bom.name}
                            </span>
                            {bomPv && (
                                <span className="text-muted-foreground">
                                    ({bomPv.skuCode} —{' '}
                                    {bomPv.product?.name ?? ''}{' '}
                                    {bomPv.name ?? ''})
                                </span>
                            )}
                        </div>
                        <div className="flex gap-1.5 flex-wrap items-center">
                            <span className="text-muted-foreground">
                                Ambil dari:
                            </span>
                            <Badge
                                variant="outline"
                                className="text-[11px] font-normal"
                            >
                                {step.materialSourceLocation?.name ??
                                    '— (stok umum)'}
                            </Badge>
                            <span>→</span>
                            <span className="text-muted-foreground">
                                Hasil ke:
                            </span>
                            {step.outputLocation ? (
                                <Badge
                                    variant="outline"
                                    className="text-[11px]"
                                >
                                    {step.outputLocation.name}
                                </Badge>
                            ) : (
                                <span className="text-red-600 font-semibold text-[11px] border border-red-200 rounded px-1.5 py-0.5 bg-red-50">
                                    Wajib pilih output
                                </span>
                            )}
                        </div>
                        <div className="flex gap-1.5 flex-wrap">
                            {step.allowsPartialHandoff && (
                                <Badge
                                    variant="outline"
                                    className="text-[10px]"
                                >
                                    Boleh estafet sebagian
                                </Badge>
                            )}
                            {step.requiresQualityGate && (
                                <Badge
                                    variant="outline"
                                    className="text-[10px]"
                                >
                                    Butuh QC
                                </Badge>
                            )}
                        </div>
                    </div>
                </div>
                {isDraft && (
                    <div className="flex flex-col gap-1 shrink-0">
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            disabled={idx === 0}
                            onClick={() => handleMove(idx, -1)}
                        >
                            ↑
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            disabled={idx === sortedSteps.length - 1}
                            onClick={() => handleMove(idx, 1)}
                        >
                            ↓
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => handleStartEdit(step)}
                        >
                            Edit
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-red-600"
                            onClick={() => handleDeleteStep(step.id)}
                        >
                            Hapus
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
