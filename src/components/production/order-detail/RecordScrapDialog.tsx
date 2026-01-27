import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ExtendedProductionOrder } from './types';
import { Location } from '@prisma/client';
import { recordScrap } from '@/actions/production';
import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

export function RecordScrapDialog({ order, locations }: { order: ExtendedProductionOrder, locations: Location[] }) {
    const [open, setOpen] = useState(false);
    const [isPending, setIsPending] = useState(false);

    async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setIsPending(true);
        const formData = new FormData(e.currentTarget);
        const data = {
            productionOrderId: order.id,
            productVariantId: formData.get('productVariantId') as string,
            locationId: formData.get('locationId') as string,
            quantity: Number(formData.get('quantity')),
            reason: formData.get('reason') as string
        };

        try {
            const result = await recordScrap(data);
            if (result.success) {
                toast.success('Scrap recorded successfully');
                setOpen(false);
            } else {
                toast.error(result.error || 'Failed to record scrap');
            }
        } catch (error) {
            toast.error('An unexpected error occurred');
            console.error(error);
        } finally {
            setIsPending(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button variant="destructive" size="sm">Record Scrap</Button></DialogTrigger>
            <DialogContent>
                <DialogHeader><DialogTitle>Record Scrap/Waste</DialogTitle></DialogHeader>
                <form onSubmit={onSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label>Item Scrapped</Label>
                        <Select name="productVariantId" required disabled={isPending}>
                            <SelectTrigger><SelectValue placeholder="Select Item" /></SelectTrigger>
                            <SelectContent>
                                {/* Output Item as Bad Goods */}
                                <SelectItem value={order.bom.productVariantId}>[Output] {order.bom.productVariant.name}</SelectItem>
                                {/* Input Items as Waste */}
                                {order.bom.items.map((item) => (
                                    <SelectItem key={item.id} value={item.productVariantId}>[Input] {item.productVariant.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Location (Scrap Bin)</Label>
                        <Select name="locationId" required disabled={isPending}>
                            <SelectTrigger><SelectValue placeholder="Select Location" /></SelectTrigger>
                            <SelectContent>
                                {locations.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Quantity</Label>
                        <Input type="number" step="0.01" name="quantity" required disabled={isPending} />
                    </div>
                    <div className="space-y-2">
                        <Label>Reason</Label>
                        <Input name="reason" placeholder="e.g. Machine setup, Contamination" disabled={isPending} />
                    </div>
                    <Button type="submit" variant="destructive" className="w-full" disabled={isPending}>
                        {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Record Scrap
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
    );
}
