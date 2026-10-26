import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { OperatorTodaySummary } from '@/actions/production/production-execution';
import { kioskLabels } from '@/lib/labels';
import { cn } from '@/lib/utils/utils';
import { KioskTodayStrip } from './KioskTodayStrip';
import { kioskButton } from './ui/kiosk-button';

interface KioskLogoutDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    operatorName: string;
    summary: OperatorTodaySummary | null;
    onConfirm: () => void;
}

/** Hand-over check before the next operator takes the tablet. */
export function KioskLogoutDialog({
    open,
    onOpenChange,
    operatorName,
    summary,
    onConfirm,
}: KioskLogoutDialogProps) {
    const activeJobs = summary?.activeJobsCount ?? 0;

    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent className="max-w-[calc(100vw-2rem)] gap-4 rounded-2xl sm:max-w-lg">
                <AlertDialogHeader>
                    <AlertDialogTitle className="text-2xl">
                        {kioskLabels.sessionLogoutTitle}
                    </AlertDialogTitle>
                    <AlertDialogDescription className="text-base">
                        {kioskLabels.sessionLogoutHint}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <KioskTodayStrip
                    operatorName={operatorName}
                    summary={summary}
                />
                {activeJobs > 0 && (
                    <p className="rounded-xl bg-kiosk-warn-soft p-3 text-base font-semibold text-kiosk-warn-ink">
                        Masih ada {activeJobs} SPK berjalan atas nama{' '}
                        {operatorName}.
                    </p>
                )}
                <AlertDialogFooter className="gap-2 sm:gap-2">
                    <AlertDialogCancel
                        className={cn(kioskButton({ size: 'lg' }), 'mt-0')}
                    >
                        {kioskLabels.sessionLogoutCancel}
                    </AlertDialogCancel>
                    <AlertDialogAction
                        onClick={onConfirm}
                        className={kioskButton({ size: 'lg', tone: 'stop' })}
                    >
                        {kioskLabels.sessionLogoutConfirm}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
