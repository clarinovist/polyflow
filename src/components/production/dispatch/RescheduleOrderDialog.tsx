'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { updateProductionOrder } from '@/actions/production';
import { toast } from 'sonner';
import { Loader2, Calendar as CalendarIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface RescheduleOrderDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    orderId: string;
    orderNumber: string;
    currentDate: Date | string | null;
}

export function RescheduleOrderDialog({
    open,
    onOpenChange,
    orderId,
    orderNumber,
    currentDate
}: RescheduleOrderDialogProps) {
    const [date, setDate] = useState<Date | undefined>(
        currentDate ? new Date(currentDate) : undefined
    );
    const [isPending, setIsPending] = useState(false);

    const handleReschedule = async () => {
        if (!date) {
            toast.error('Please select a date');
            return;
        }

        setIsPending(true);
        try {
            const result = await updateProductionOrder({
                id: orderId,
                plannedStartDate: date
            });

            if (result.success) {
                toast.success('Order rescheduled successfully');
                onOpenChange(false);
            } else {
                toast.error(result.error || 'Failed to reschedule order');
            }
        } catch (err) {
            console.error(err);
            toast.error('An error occurred during rescheduling');
        } finally {
            setIsPending(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Reschedule Order</DialogTitle>
                    <DialogDescription>
                        Change the planned start date for order <span className="font-bold text-foreground">{orderNumber}</span>.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label>Planned Start Date</Label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant={"outline"}
                                    className={cn(
                                        "w-full justify-start text-left font-normal h-12",
                                        !date && "text-muted-foreground"
                                    )}
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {date ? format(date, "PPP") : <span>Pick a date</span>}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                                <Calendar
                                    mode="single"
                                    selected={date}
                                    onSelect={setDate}
                                    captionLayout="dropdown"
                                    fromYear={2000}
                                    toYear={new Date().getFullYear() + 1}
                                    initialFocus
                                />
                            </PopoverContent>
                        </Popover>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                        Cancel
                    </Button>
                    <Button onClick={handleReschedule} disabled={isPending || !date}>
                        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Confirm Reschedule
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
