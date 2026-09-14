import type { DeliveryOrderDetailData } from './types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { LucideIcon } from 'lucide-react';
import { format } from 'date-fns';
import { getDeliveryStatusLabel } from '@/lib/sales/delivery-status';

interface DeliveryProgressTimelineProps {
    order: DeliveryOrderDetailData;
    statusSteps: { status: string; icon: LucideIcon; label: string }[];
    currentStatusIndex: number;
}

export function DeliveryProgressTimeline({
    order,
    statusSteps,
    currentStatusIndex,
}: DeliveryProgressTimelineProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="relative space-y-8 before:absolute before:inset-0 before:ml-5 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-300 dark:before:via-slate-600 before:to-transparent">
                    {statusSteps.map((step, idx) => {
                        const isCompleted = idx <= currentStatusIndex;
                        const Icon = step.icon;
                        return (
                            <div
                                key={idx}
                                className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active"
                            >
                                <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white dark:border-slate-700 bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400 group-[.is-active]:bg-emerald-500 group-[.is-active]:text-emerald-50 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2">
                                    <Icon
                                        className={`h-5 w-5 ${isCompleted ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}
                                    />
                                </div>
                                <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded border border-slate-200 bg-white dark:border-slate-700 dark:bg-zinc-900 shadow">
                                    <div className="flex items-center justify-between space-x-2 mb-1">
                                        <div
                                            className={`font-bold ${isCompleted ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400'}`}
                                        >
                                            {step.label}
                                        </div>
                                        {isCompleted && idx === 1 && (
                                            <time className="font-caveat font-medium text-indigo-500">
                                                {format(
                                                    new Date(
                                                        order.deliveryDate,
                                                    ),
                                                    'PP',
                                                )}
                                            </time>
                                        )}
                                    </div>
                                    <div className="text-slate-500 dark:text-slate-400">
                                        {isCompleted
                                            ? `Status tercapai: ${getDeliveryStatusLabel(step.status)}`
                                            : 'Menunggu...'}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </CardContent>
        </Card>
    );
}
