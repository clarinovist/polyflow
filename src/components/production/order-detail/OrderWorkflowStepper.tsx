import { AlertTriangle, CheckCircle, XCircle, Package } from 'lucide-react';
import { cn } from '@/lib/utils/utils';
import { getStatusLabel } from '@/lib/labels';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export function OrderWorkflowStepper({ status }: { status: string }) {
    const steps = [
        { id: 'DRAFT', label: getStatusLabel('DRAFT', 'production'), description: 'Perencanaan' },
        { id: 'RELEASED', label: getStatusLabel('RELEASED', 'production'), description: 'Persiapan' },
        { id: 'IN_PROGRESS', label: getStatusLabel('IN_PROGRESS', 'production'), description: 'Eksekusi' },
        { id: 'COMPLETED', label: getStatusLabel('COMPLETED', 'production'), description: 'Selesai' },
    ];

    // WAITING_MATERIAL is a side state between DRAFT and RELEASED
    const isWaitingMaterial = status === 'WAITING_MATERIAL';
    const effectiveIndex = isWaitingMaterial
        ? 0 // visually before RELEASED, after DRAFT
        : steps.findIndex(s => s.id === status);

    if (status === 'CANCELLED') {
        return (
            <div className="w-full p-4 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-3 text-destructive">
                <XCircle className="w-5 h-5" />
                <span className="font-medium">{getStatusLabel('CANCELLED', 'production')}</span>
            </div>
        )
    }

    return (
        <div className="w-full py-4 space-y-4">
            {isWaitingMaterial && (
                <div className="w-full p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3 text-amber-900 dark:bg-amber-900/20 dark:border-amber-800/50 dark:text-amber-200">
                    <Package className="w-5 h-5 mt-0.5 shrink-0" />
                    <div className="flex-1">
                        <p className="text-sm font-semibold">SPK menunggu bahan</p>
                        <p className="text-xs mt-1 leading-relaxed">
                            Cek tab Bahan; issue bahan baku (Path A) di Gudang. Setelah bahan tersedia, Rilis SPK.
                        </p>
                    </div>
                    <Link href="/warehouse">
                        <Button size="sm" variant="outline" className="text-xs border-amber-300 bg-white hover:bg-amber-50 dark:bg-zinc-900 dark:border-amber-700">
                            Buka Gudang
                        </Button>
                    </Link>
                </div>
            )}

            <div className="relative flex items-center justify-between w-full">
                {/* Connecting Lines */}
                <div className="absolute top-[14px] left-0 w-full h-[2px] bg-muted -z-10" />

                {steps.map((step, index) => {
                    // For WAITING_MATERIAL: DRAFT is completed, RELEASED is current with amber style
                    const isCompleted = isWaitingMaterial ? index === 0 : index < effectiveIndex;
                    const isCurrent = isWaitingMaterial ? index === 1 : index === effectiveIndex;
                    const isWaitingNode = isWaitingMaterial && index === 1;

                    return (
                        <div key={step.id} className="flex flex-col items-center gap-2 px-2">
                            <div className={cn(
                                "w-8 h-8 rounded-full flex items-center justify-center border transition-colors",
                                isWaitingNode
                                    ? "bg-amber-100 border-amber-400 text-amber-700 ring-2 ring-amber-200 dark:bg-amber-900/30 dark:border-amber-500 dark:text-amber-300"
                                    : isCompleted ? "bg-primary border-primary text-primary-foreground" :
                                        isCurrent ? "bg-background border-foreground text-foreground ring-2 ring-muted shadow-sm" :
                                            "bg-muted border-muted-foreground/20 text-muted-foreground/50"
                            )}>
                                {isCompleted ? <CheckCircle className="w-5 h-5" /> :
                                    isCurrent ? <div className={cn("w-2.5 h-2.5 rounded-full", isWaitingNode ? "bg-amber-600" : "bg-foreground")} /> :
                                        <div className="w-2.5 h-2.5 bg-muted-foreground/30 rounded-full" />}
                            </div>
                            <div className="text-center">
                                <p className={cn(
                                    "text-sm font-medium",
                                    isCompleted || isCurrent ? "text-foreground" : "text-muted-foreground",
                                    isWaitingNode && "text-amber-700 dark:text-amber-300"
                                )}>
                                    {isWaitingNode ? getStatusLabel('WAITING_MATERIAL', 'production') : step.label}
                                </p>
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{step.description}</p>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Step Specific Actions Hints */}
            <div className="mt-2 bg-muted/40 border rounded-md p-3 text-sm text-foreground flex items-start gap-3">
                <div className="mt-0.5 text-zinc-500">
                    <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                    {status === 'DRAFT' && "Rencanakan SPK. Periksa BOM dan kuantitas. Jika sudah siap, klik 'Rilis SPK'."}
                    {isWaitingMaterial && "SPK menunggu konfirmasi bahan. Cek tab Bahan atau hubungi Gudang (Path A). Setelah tersedia, Rilis SPK."}
                    {status === 'RELEASED' && "SPK siap dipersiapkan. Ambil bahan dan tetapkan Shift/Mesin sebelum memulai."}
                    {status === 'IN_PROGRESS' && "Produksi sedang berjalan. Catat hasil, scrap, dan inspeksi kualitas dengan benar."}
                    {status === 'COMPLETED' && "SPK selesai. Inventaris sudah diperbarui. Tidak ada tindakan lebih lanjut."}
                </div>
            </div>
        </div>
    );
}

