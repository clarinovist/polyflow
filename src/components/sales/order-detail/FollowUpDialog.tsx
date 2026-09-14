import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CalendarClock } from 'lucide-react';
import type { SerializedSalesOrder } from '../sales-order-types';

interface FollowUpDialogProps {
    order: SerializedSalesOrder;
    isFollowUpDialogOpen: boolean;
    setIsFollowUpDialogOpen: (open: boolean) => void;
    followUpDateInput: string;
    setFollowUpDateInput: (date: string) => void;
    isLoading: boolean;
    handleClearFollowUp: () => Promise<void>;
    handleSaveFollowUp: () => Promise<void>;
}

export function FollowUpDialog({
    order,
    isFollowUpDialogOpen,
    setIsFollowUpDialogOpen,
    followUpDateInput,
    setFollowUpDateInput,
    isLoading,
    handleClearFollowUp,
    handleSaveFollowUp,
}: FollowUpDialogProps) {
    return (
        <Dialog
            open={isFollowUpDialogOpen}
            onOpenChange={(open) => {
                if (!open) setIsFollowUpDialogOpen(false);
            }}
        >
            <DialogContent className="sm:max-w-[400px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <CalendarClock className="h-5 w-5" />
                        Jadwalkan Follow-up
                    </DialogTitle>
                    <DialogDescription>
                        Atur tanggal follow-up untuk {order.orderNumber}.
                        Kosongkan untuk hapus jadwal.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                    <div className="grid gap-2">
                        <Label htmlFor="followUpDate">Tanggal follow-up</Label>
                        <Input
                            id="followUpDate"
                            type="date"
                            value={followUpDateInput}
                            onChange={(e) =>
                                setFollowUpDateInput(e.target.value)
                            }
                        />
                    </div>
                </div>
                <DialogFooter className="gap-2 sm:gap-0">
                    <Button
                        variant="ghost"
                        onClick={() => {
                            setFollowUpDateInput('');
                            setIsFollowUpDialogOpen(false);
                        }}
                    >
                        Batal
                    </Button>
                    <Button
                        variant="outline"
                        disabled={isLoading}
                        onClick={handleClearFollowUp}
                    >
                        Hapus jadwal
                    </Button>
                    <Button disabled={isLoading} onClick={handleSaveFollowUp}>
                        Simpan
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
