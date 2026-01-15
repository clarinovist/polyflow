import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export function OrderWorkflowStepper({ status }: { status: string }) {
    const steps = [
        { id: 'DRAFT', label: 'Draft', description: 'Planning' },
        { id: 'RELEASED', label: 'Released', description: 'Preparation' },
        { id: 'IN_PROGRESS', label: 'In Progress', description: 'Execution' },
        { id: 'COMPLETED', label: 'Completed', description: 'Finished' },
    ];

    const currentStepIndex = steps.findIndex(s => s.id === status);

    if (status === 'CANCELLED') {
        return (
            <div className="w-full p-4 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-3 text-destructive">
                <XCircle className="w-5 h-5" />
                <span className="font-medium">Order Cancelled</span>
            </div>
        )
    }

    return (
        <div className="w-full py-4">
            <div className="relative flex items-center justify-between w-full">
                {/* Connecting Lines */}
                <div className="absolute top-[14px] left-0 w-full h-[2px] bg-muted -z-10" />

                {steps.map((step, index) => {
                    const isCompleted = index < currentStepIndex;
                    const isCurrent = index === currentStepIndex;

                    return (
                        <div key={step.id} className="flex flex-col items-center gap-2 px-2">
                            <div className={cn(
                                "w-8 h-8 rounded-full flex items-center justify-center border transition-colors",
                                isCompleted ? "bg-primary border-primary text-primary-foreground" :
                                    isCurrent ? "bg-background border-foreground text-foreground ring-2 ring-muted shadow-sm" :
                                        "bg-muted border-muted-foreground/20 text-muted-foreground/50"
                            )}>
                                {isCompleted ? <CheckCircle className="w-5 h-5" /> :
                                    isCurrent ? <div className="w-2.5 h-2.5 bg-foreground rounded-full" /> :
                                        <div className="w-2.5 h-2.5 bg-muted-foreground/30 rounded-full" />}
                            </div>
                            <div className="text-center">
                                <p className={cn(
                                    "text-sm font-medium",
                                    isCompleted || isCurrent ? "text-foreground" : "text-muted-foreground"
                                )}>{step.label}</p>
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{step.description}</p>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Step Specific Actions Hints */}
            <div className="mt-4 bg-muted/40 border rounded-md p-3 text-sm text-foreground flex items-start gap-3">
                <div className="mt-0.5 text-zinc-500">
                    <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                    {status === 'DRAFT' && "Plan your order. Check BOM recipe and quantity. When ready, click 'Release Order'."}
                    {status === 'RELEASED' && "Order is ready for preparation. Please Issue Materials and Assign Shifts/Machines before starting."}
                    {status === 'IN_PROGRESS' && "Production is running. Record your output, scrap, and quality inspections properly."}
                    {status === 'COMPLETED' && "Order is finished. Inventory has been updated. No further actions required."}
                </div>
            </div>
        </div>
    );
}
