'use client';

import { useMemo, useState } from 'react';
import { Loader2, PackageCheck, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
    confirmAdditionalMaterialRequest,
    rejectAdditionalMaterialRequest,
} from '@/actions/production/production';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { Location } from '@prisma/client';
import {
    isEligibleMaterialSourceLocation,
    resolveLocationIdByRole,
    resolveMaterialSourceLocationId,
    type LocationLike,
} from '@/lib/locations/resolve-location';
import { toDecimalNumber } from '@/lib/utils/utils';

export type PendingAdditionalMaterialRequest = {
    id: string;
    productionOrderId: string;
    quantity: number | { toString(): string };
    reason: string;
    requestedAt: Date | string;
    productVariant: {
        id: string;
        name: string;
        skuCode: string;
        primaryUnit: string;
        product: { productType: string };
    };
    operator: { id: string; name: string };
};

interface AdditionalMaterialRequestReviewDialogProps {
    orderNumber: string;
    requests: PendingAdditionalMaterialRequest[];
    locations: Location[];
    onSuccess: () => void;
}

export function AdditionalMaterialRequestReviewDialog({
    orderNumber,
    requests,
    locations,
    onSuccess,
}: AdditionalMaterialRequestReviewDialogProps) {
    const [open, setOpen] = useState(false);
    const [selectedRequestId, setSelectedRequestId] = useState('');
    const [locationId, setLocationId] = useState('');
    const [rejectionReason, setRejectionReason] = useState('');
    const [loadingAction, setLoadingAction] = useState<'confirm' | 'reject' | null>(null);

    const selectedRequest = requests.find((item) => item.id === selectedRequestId);
    const eligibleLocations = useMemo(
        () =>
            locations.filter(
                (location) =>
                    location.locationType === 'INTERNAL' &&
                    isEligibleMaterialSourceLocation(location as LocationLike),
            ),
        [locations],
    );
    const rawMaterialLocationId = useMemo(
        () =>
            resolveLocationIdByRole(
                eligibleLocations as LocationLike[],
                'RAW_MATERIAL',
            ) || eligibleLocations[0]?.id || '',
        [eligibleLocations],
    );
    const suggestedLocationId = selectedRequest
        ? resolveMaterialSourceLocationId(
              eligibleLocations as LocationLike[],
              selectedRequest.productVariant.product.productType,
              rawMaterialLocationId,
          )
        : rawMaterialLocationId;
    const effectiveLocationId = locationId || suggestedLocationId;

    const handleRequestChange = (requestId: string) => {
        setSelectedRequestId(requestId);
        setLocationId('');
        setRejectionReason('');
    };

    const reset = () => {
        setSelectedRequestId(requests[0]?.id || '');
        setLocationId('');
        setRejectionReason('');
    };

    const handleOpenChange = (nextOpen: boolean) => {
        setOpen(nextOpen);
        if (nextOpen) reset();
    };

    const finish = () => {
        setOpen(false);
        reset();
        onSuccess();
    };

    const handleConfirm = async () => {
        if (!selectedRequest || !effectiveLocationId) {
            toast.error('Pilih permintaan dan lokasi sumber.');
            return;
        }
        setLoadingAction('confirm');
        try {
            const result = await confirmAdditionalMaterialRequest({
                requestId: selectedRequest.id,
                sourceLocationId: effectiveLocationId,
            });
            if (!result.success) {
                toast.error(result.error);
                return;
            }
            toast.success('Bahan dikonfirmasi, stok berkurang, dan HPP SPK diperbarui.');
            finish();
        } catch {
            toast.error('Gagal mengonfirmasi permintaan bahan.');
        } finally {
            setLoadingAction(null);
        }
    };

    const handleReject = async () => {
        if (!selectedRequest || rejectionReason.trim().length < 3) {
            toast.error('Pilih permintaan dan isi alasan penolakan.');
            return;
        }
        setLoadingAction('reject');
        try {
            const result = await rejectAdditionalMaterialRequest({
                requestId: selectedRequest.id,
                reason: rejectionReason,
            });
            if (!result.success) {
                toast.error(result.error);
                return;
            }
            toast.success('Permintaan bahan tambahan ditolak.');
            finish();
        } catch {
            toast.error('Gagal menolak permintaan bahan.');
        } finally {
            setLoadingAction(null);
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    className="h-10 border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
                >
                    <PackageCheck className="mr-2 h-4 w-4" />
                    Review Bahan Tambahan ({requests.length})
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>Review Bahan Tambahan</DialogTitle>
                    <DialogDescription>
                        SPK {orderNumber}. Konfirmasi akan langsung mengurangi stok
                        dan memasukkan biaya ke HPP aktual.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="additional-request">Permintaan</Label>
                        <Select value={selectedRequestId} onValueChange={handleRequestChange}>
                            <SelectTrigger id="additional-request" className="h-12">
                                <SelectValue placeholder="Pilih permintaan" />
                            </SelectTrigger>
                            <SelectContent>
                                {requests.map((request) => (
                                    <SelectItem key={request.id} value={request.id}>
                                        {request.productVariant.name} · {toDecimalNumber(request.quantity).toLocaleString('id-ID')} {request.productVariant.primaryUnit}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {selectedRequest && (
                        <div className="rounded-lg border bg-muted/40 p-3 text-sm space-y-1">
                            <p><span className="font-semibold">Operator:</span> {selectedRequest.operator.name}</p>
                            <p><span className="font-semibold">Alasan:</span> {selectedRequest.reason}</p>
                            <p className="text-xs text-muted-foreground">
                                Diajukan {new Date(selectedRequest.requestedAt).toLocaleString('id-ID')}
                            </p>
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label htmlFor="additional-request-location">Ambil dari</Label>
                        <Select value={effectiveLocationId} onValueChange={setLocationId}>
                            <SelectTrigger id="additional-request-location" className="h-12">
                                <SelectValue placeholder="Pilih lokasi sumber" />
                            </SelectTrigger>
                            <SelectContent>
                                {eligibleLocations.map((location) => (
                                    <SelectItem key={location.id} value={location.id}>
                                        {location.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="additional-request-rejection">Alasan penolakan</Label>
                        <Textarea
                            id="additional-request-rejection"
                            value={rejectionReason}
                            onChange={(event) => setRejectionReason(event.target.value)}
                            maxLength={500}
                            placeholder="Diisi hanya jika permintaan ditolak"
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button
                        type="button"
                        variant="destructive"
                        className="h-12"
                        disabled={!!loadingAction}
                        onClick={handleReject}
                    >
                        {loadingAction === 'reject' ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <XCircle className="mr-2 h-4 w-4" />
                        )}
                        Tolak
                    </Button>
                    <Button
                        type="button"
                        className="h-12"
                        disabled={!!loadingAction || !effectiveLocationId}
                        onClick={handleConfirm}
                    >
                        {loadingAction === 'confirm' && (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Konfirmasi & Potong Stok
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
