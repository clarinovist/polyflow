import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ExtendedProductionOrder } from './types';
import { recordQualityInspection } from '@/actions/production';
import { BrandCard, BrandCardContent, BrandCardHeader } from '@/components/brand/BrandCard';
import { ClipboardCheck } from 'lucide-react';

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
                <form onSubmit={onSubmit}>
                    <BrandCard variant="default" className="mt-4 shadow-brand">
                        <BrandCardHeader className="pb-4">
                            <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                                    <ClipboardCheck className="w-4 h-4 text-primary" />
                                </div>
                                <h3 className="font-bold text-base tracking-tight italic uppercase text-foreground">QC Assessment</h3>
                            </div>
                        </BrandCardHeader>
                        <BrandCardContent className="space-y-4 pt-6">
                            <div className="space-y-2">
                                <Label className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Result</Label>
                                <Select name="result" required>
                                    <SelectTrigger className="bg-background/80 border-brand-border h-10 text-foreground font-medium">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="PASS">PASS</SelectItem>
                                        <SelectItem value="FAIL">FAIL</SelectItem>
                                        <SelectItem value="QUARANTINE">QUARANTINE</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Notes</Label>
                                <Textarea name="notes" placeholder="Inspection comments..." className="bg-background/80 border-brand-border min-h-[100px] resize-none" />
                            </div>
                        </BrandCardContent>
                    </BrandCard>
                    <div className="mt-6">
                        <Button type="submit" className="w-full font-bold italic uppercase tracking-tight h-12 shadow-lg">Save Result</Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
