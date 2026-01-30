'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { shipSalesOrderSchema, ShipSalesOrderValues } from '@/lib/schemas/sales';
import { shipSalesOrder } from '@/actions/sales';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Truck } from 'lucide-react';

interface ShipmentDialogProps {
    orderId: string;
    orderNumber: string;
    isOpen: boolean;
    onClose: () => void;
}

export function ShipmentDialog({ orderId, orderNumber, isOpen, onClose }: ShipmentDialogProps) {
    const [isPending, setIsPending] = useState(false);
    const router = useRouter();

    const form = useForm({
        resolver: zodResolver(shipSalesOrderSchema),
        defaultValues: {
            id: orderId,
            carrier: '',
            trackingNumber: '',
        },
    });

    const onSubmit = async (values: ShipSalesOrderValues) => {
        setIsPending(true);
        try {
            const result = await shipSalesOrder(values);
            if (result.success) {
                toast.success('Order shipped successfully');
                onClose();
                router.refresh();
            } else {
                toast.error(result.error || 'Failed to ship order');
            }
        } catch (_error) {
            toast.error('An unexpected error occurred');
        } finally {
            setIsPending(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Truck className="h-5 w-5 text-purple-600" />
                        Ship Order {orderNumber}
                    </DialogTitle>
                    <DialogDescription>
                        Enter shipment details to confirm delivery dispatch.
                    </DialogDescription>
                </DialogHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
                        <FormField
                            control={form.control}
                            name="carrier"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Courier / Carrier</FormLabel>
                                    <FormControl>
                                        <Input placeholder="e.g. JNE, J&T, Internal Courier" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="trackingNumber"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Tracking Number</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Enter AWB or Tracking ID" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <DialogFooter className="mt-6">
                            <Button variant="outline" type="button" onClick={onClose} disabled={isPending}>
                                Cancel
                            </Button>
                            <Button type="submit" className="bg-purple-600 hover:bg-purple-700" disabled={isPending}>
                                {isPending ? 'Processing...' : 'Confirm Shipment'}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
