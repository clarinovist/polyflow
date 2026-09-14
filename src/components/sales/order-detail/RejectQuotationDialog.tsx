import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { SALES_LOST_REASON_OPTIONS } from '@/lib/sales/order-phase';
import type { SerializedSalesOrder } from '../sales-order-types';

interface RejectQuotationDialogProps {
    order: SerializedSalesOrder;
    isRejectDialogOpen: boolean;
    setIsRejectDialogOpen: (open: boolean) => void;
    lostReasonValue: string;
    setLostReasonValue: (reason: string) => void;
    lostReasonNotes: string;
    setLostReasonNotes: (notes: string) => void;
    isLoading: boolean;
    handleRejectQuotation: () => Promise<void>;
}

export function RejectQuotationDialog({
    order,
    isRejectDialogOpen,
    setIsRejectDialogOpen,
    lostReasonValue,
    setLostReasonValue,
    lostReasonNotes,
    setLostReasonNotes,
    isLoading,
    handleRejectQuotation,
}: RejectQuotationDialogProps) {
    return (
        <Dialog
            open={isRejectDialogOpen}
            onOpenChange={(open) => {
                if (!open) {
                    setIsRejectDialogOpen(false);
                }
            }}
        >
            <DialogContent className="sm:max-w-[420px]">
                <DialogHeader>
                    <DialogTitle>Tolak penawaran</DialogTitle>
                    <DialogDescription>
                        Pilih alasan penolakan untuk {order.orderNumber}. Alasan
                        wajib diisi.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                    <div className="grid gap-2">
                        <Label htmlFor="lostReason">Alasan kalah *</Label>
                        <Select
                            value={lostReasonValue}
                            onValueChange={setLostReasonValue}
                        >
                            <SelectTrigger id="lostReason">
                                <SelectValue placeholder="Pilih alasan" />
                            </SelectTrigger>
                            <SelectContent>
                                {SALES_LOST_REASON_OPTIONS.map((opt) => (
                                    <SelectItem
                                        key={opt.value}
                                        value={opt.value}
                                    >
                                        {opt.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="lostReasonNotes">
                            Catatan
                            {lostReasonValue === 'LAINNYA'
                                ? ' *'
                                : ' (opsional)'}
                        </Label>
                        <Textarea
                            id="lostReasonNotes"
                            value={lostReasonNotes}
                            onChange={(e) => setLostReasonNotes(e.target.value)}
                            placeholder={
                                lostReasonValue === 'LAINNYA'
                                    ? 'Jelaskan alasan lainnya (wajib)'
                                    : 'Catatan tambahan (opsional)'
                            }
                            rows={3}
                        />
                    </div>
                </div>
                <DialogFooter className="gap-2 sm:gap-0">
                    <Button
                        variant="ghost"
                        onClick={() => {
                            setIsRejectDialogOpen(false);
                        }}
                        disabled={isLoading}
                    >
                        Batal
                    </Button>
                    <Button
                        variant="destructive"
                        disabled={
                            isLoading ||
                            !lostReasonValue ||
                            (lostReasonValue === 'LAINNYA' &&
                                !lostReasonNotes.trim())
                        }
                        onClick={handleRejectQuotation}
                    >
                        Tolak penawaran
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
