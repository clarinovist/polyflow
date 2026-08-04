'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils/utils';

type FlowStepStatus = 'done' | 'current' | 'pending' | 'blocked' | 'FIRST_STEP' | 'READY' | 'PARTIAL_WIP' | 'WAITING_WIP' | 'FIRST';

export type RouteFlowChainStep = {
  label: string;
  stepCode?: string;
  processCode?: string;
  outputSkuLabel: string;
  outputLocationName?: string | null;
  status?: FlowStepStatus | string;
  extraLine?: string | null;
  readinessLabel?: string | null;
};

function statusClasses(status?: string) {
  const s = (status ?? '').toUpperCase();
  if (s === 'DONE' || s === 'COMPLETED' || s === 'READY' || s === 'FIRST_STEP' || s === 'FIRST') {
    return {
      circle: 'bg-green-600 border-green-600 text-white',
      box: 'border-green-200 bg-green-50',
      line: 'bg-green-200',
    };
  }
  if (s === 'CURRENT' || s === 'IN_PROGRESS' || s === 'PARTIAL_WIP' || s === 'PARTIAL') {
    return {
      circle: 'bg-blue-600 border-blue-600 text-white ring-2 ring-blue-100',
      box: 'border-blue-200 bg-blue-50',
      line: 'bg-blue-200',
    };
  }
  if (s === 'BLOCKED' || s === 'WAITING_WIP' || s === 'WAITING_MATERIAL') {
    return {
      circle: 'bg-amber-500 border-amber-500 text-white',
      box: 'border-amber-200 bg-amber-50',
      line: 'bg-amber-200',
    };
  }
  if (s === 'CANCELLED') {
    return {
      circle: 'bg-red-200 border-red-300 text-red-700',
      box: 'border-red-200 bg-red-50/50',
      line: 'bg-muted',
    };
  }
  return {
    circle: 'bg-muted border-muted-foreground/20 text-muted-foreground',
    box: 'border-border bg-background',
    line: 'bg-muted',
  };
}

export function RouteFlowChain({
  steps,
  title = 'Alur Tahap',
}: {
  steps: RouteFlowChainStep[];
  title?: string;
}) {
  if (steps.length === 0) return null;

  const hasStatus = steps.some((s) => !!s.status);

  return (
    <Card className="bg-muted/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-semibold">{title} ({steps.length} tahap)</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="overflow-x-auto pb-2">
          <div className="flex items-stretch gap-0 min-w-max">
            {steps.map((step, idx) => {
              const st = statusClasses(step.status);
              const isLast = idx === steps.length - 1;
              const seq = idx + 1;
              return (
                <div key={`${step.stepCode ?? step.label}-${idx}`} className="flex items-stretch">
                  <div className="flex flex-col items-center gap-2 shrink-0">
                    <div className="relative flex flex-col items-center">
                      {/* connector line top for first row – horizontal rail at circle level */}
                      <div
                        className={cn(
                          'w-8 h-8 rounded-full flex items-center justify-center border text-[11px] font-bold shrink-0',
                          st.circle,
                          hasStatus ? '' : 'bg-foreground text-background border-foreground',
                        )}
                      >
                        {hasStatus ? (step.status ? String(step.status).slice(0, 1).toUpperCase() : seq) : seq}
                      </div>
                    </div>
                    <div className={cn('rounded border p-2.5 min-w-[160px] max-w-[200px] space-y-1', st.box)}>
                      <div className="text-xs font-semibold leading-tight line-clamp-2">{step.label}</div>
                      <div className="flex gap-1 flex-wrap items-center">
                        {step.processCode && <Badge variant="outline" className="text-[10px] font-mono h-4">{step.processCode}</Badge>}
                        {step.stepCode && <span className="text-[10px] text-muted-foreground font-mono">{step.stepCode}</span>}
                      </div>
                      <div className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-background border truncate">
                        {step.outputSkuLabel}
                      </div>
                      {step.outputLocationName && (
                        <div className="text-[10px] text-muted-foreground truncate">→ {step.outputLocationName}</div>
                      )}
                      {step.readinessLabel && (
                        <div className="pt-0.5">
                          <Badge variant="outline" className="text-[9px] h-4">{step.readinessLabel}</Badge>
                        </div>
                      )}
                      {step.extraLine && (
                        <div className="text-[10px] text-muted-foreground">{step.extraLine}</div>
                      )}
                      {step.status && (
                        <div className="text-[10px]">
                          <Badge variant="outline" className={cn('text-[9px] h-4', st.box)}>{String(step.status)}</Badge>
                        </div>
                      )}
                    </div>
                  </div>
                  {!isLast && (
                    <div className="flex items-center justify-center w-10 shrink-0">
                      <div className="flex items-center gap-0">
                        <div className={cn('h-[2px] w-6', st.line)} />
                        <span className="text-[10px] text-muted-foreground">▶</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
