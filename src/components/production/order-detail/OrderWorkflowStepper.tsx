import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils/utils';
import { getStatusLabel } from '@/lib/labels';

export function OrderWorkflowStepper({ status }: { status: string }) {
    const steps = [
        { id: 'DRAFT', label: getStatusLabel('DRAFT', 'production'), description: 'Perencanaan' },
        { id: 'RELEASED', label: getStatusLabel('RELEASED', 'production'), description: 'Persiapan' },
        { id: 'IN_PROGRESS', label: getStatusLabel('IN_PROGRESS', 'production'), description: 'Eksekusi' },
        { id: 'COMPLETED', label: getStatusLabel('COMPLETED', 'production'), description: 'Selesai' },
    ];

    const currentStepIndex = steps.findIndex(s => s.id === status);

    if (status === 'CANCELLED') {
        return (
            <div className="w-full p-4 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-3 text-destructive">
                <XCircle className="w-5 h-5" />
                <span className="font-medium">{getStatusLabel('CANCELLED', 'production')}</span>
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
                    {status === 'DRAFT' && "Rencanakan SPK. Periksa BOM dan kuantitas. Jika sudah siap, klik 'Rilis SPK'."}
                    {status === 'RELEASED' && "SPK siap dipersiapkan. Ambil bahan dan tetapkan Shift/Mesin sebelum memulai."}
                    {status === 'IN_PROGRESS' && "Produksi sedang berjalan. Catat hasil, scrap, dan inspeksi kualitas dengan benar."}
                    {status === 'COMPLETED' && "SPK selesai. Inventaris sudah diperbarui. Tidak ada tindakan lebih lanjut."}
                </div>
            </div>
        </div>
    );
}
