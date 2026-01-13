import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ExtendedProductionOrder } from './types';
import { recordQualityInspection } from '@/actions/production';

export function RecordQCDialog({ order }: { order: ExtendedProductionOrder }) {
    async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const data = {
            productionOrderId: order.id,
            result: formData.get('result') as 'PASS' | 'FAIL' | 'QUARANTINE',
            notes: formData.get('notes') as string
        };
        await recordQualityInspection(data);
    }

    return (
        <Dialog>
            <DialogTrigger asChild><Button size="sm">Add Inspection</Button></DialogTrigger>
            <DialogContent>
                <DialogHeader><DialogTitle>Quality Inspection</DialogTitle></DialogHeader>
                <form onSubmit={onSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label>Result</Label>
                        <Select name="result" required>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="PASS">PASS</SelectItem>
                                <SelectItem value="FAIL">FAIL</SelectItem>
                                <SelectItem value="QUARANTINE">QUARANTINE</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Notes</Label>
                        <Textarea name="notes" placeholder="Inspection comments..." />
                    </div>
                    <Button type="submit" className="w-full">Save Result</Button>
                </form>
            </DialogContent>
        </Dialog>
    );
}
