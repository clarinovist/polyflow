'use client';

import { useState } from 'react';
import {
    PurchaseRequest,
    PurchaseRequestItem,
    ProductVariant,
    Product,
} from '@prisma/client';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { format } from 'date-fns';
import {
    consolidatePurchaseRequests,
    approvePurchaseRequest,
    rejectPurchaseRequest,
} from '@/actions/purchasing/purchasing';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { Loader2, Merge, CheckCircle, XCircle } from 'lucide-react';
import {
    getStatusLabel,
    purchasingLabels,
    formLabels,
    actionLabels,
} from '@/lib/labels';

type RequestWithRelations = PurchaseRequest & {
    items: (PurchaseRequestItem & {
        productVariant: ProductVariant & {
            product: Product;
        };
    })[];
    salesOrder?: { orderNumber: string } | null;
    createdBy: { name: string | null };
    reviewedBy?: { id: string; name: string | null } | null;
};

type Supplier = {
    id: string;
    name: string;
};

interface RequestListProps {
    requests: RequestWithRelations[];
    suppliers: Supplier[];
    canApprove?: boolean;
}

const STATUS_BADGE_VARIANT: Record<
    string,
    'default' | 'secondary' | 'destructive' | 'outline'
> = {
    OPEN: 'default',
    APPROVED: 'outline',
    REJECTED: 'destructive',
    CONVERTED: 'secondary',
};

export function RequestList({
    requests,
    suppliers,
    canApprove = false,
}: RequestListProps) {
    const router = useRouter();
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isConvertOpen, setIsConvertOpen] = useState(false);
    const [selectedSupplier, setSelectedSupplier] = useState('');
    const [isConverting, setIsConverting] = useState(false);

    // Reject dialog state
    const [isRejectOpen, setIsRejectOpen] = useState(false);
    const [rejectTargetId, setRejectTargetId] = useState<string | null>(null);
    const [rejectReason, setRejectReason] = useState('');
    const [isRejecting, setIsRejecting] = useState(false);

    // Approve loading
    const [approvingId, setApprovingId] = useState<string | null>(null);

    // Filter only APPROVED requests for selection (consolidation)
    const approvedRequests = requests.filter(
        (r) => r.status === 'APPROVED',
    );

    // Toggle single selection
    const handleSelect = (id: string, checked: boolean) => {
        if (checked) {
            setSelectedIds((prev) => [...prev, id]);
        } else {
            setSelectedIds((prev) => prev.filter((i) => i !== id));
        }
    };

    // Toggle all APPROVED
    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedIds(approvedRequests.map((r) => r.id));
        } else {
            setSelectedIds([]);
        }
    };

    const handleActionClick = (id?: string) => {
        if (id) {
            setSelectedIds([id]);
        }
        if (selectedIds.length === 0 && !id) {
            toast.error('Pilih minimal satu permintaan.');
            return;
        }
        setSelectedSupplier('');
        setIsConvertOpen(true);
    };

    const handleConfirmConvert = async () => {
        if (selectedIds.length === 0 || !selectedSupplier) return;

        setIsConverting(true);
        try {
            const result = await consolidatePurchaseRequests(
                selectedIds,
                selectedSupplier,
            );
            if (result.success) {
                toast.success(
                    `Berhasil membuat Purchase Order dari ${selectedIds.length} permintaan`,
                );
                setIsConvertOpen(false);
                setSelectedIds([]);
                router.refresh();
            } else {
                toast.error(result.error);
            }
        } catch (error) {
            toast.error(
                'Gagal menggabungkan permintaan pembelian. Silakan coba lagi.',
            );
            console.error(error);
        } finally {
            setIsConverting(false);
        }
    };

    const handleApprove = async (id: string) => {
        setApprovingId(id);
        try {
            const result = await approvePurchaseRequest(id);
            if (result.success) {
                toast.success('Permintaan pembelian berhasil Disetujui');
                router.refresh();
            } else {
                toast.error(result.error);
            }
        } catch (error) {
            toast.error('Gagal menyetujui permintaan. Silakan coba lagi.');
            console.error(error);
        } finally {
            setApprovingId(null);
        }
    };

    const handleOpenReject = (id: string) => {
        setRejectTargetId(id);
        setRejectReason('');
        setIsRejectOpen(true);
    };

    const handleConfirmReject = async () => {
        if (!rejectTargetId || !rejectReason.trim()) return;

        setIsRejecting(true);
        try {
            const result = await rejectPurchaseRequest(
                rejectTargetId,
                rejectReason.trim(),
            );
            if (result.success) {
                toast.success('Permintaan pembelian berhasil ditolak');
                setIsRejectOpen(false);
                setRejectTargetId(null);
                setRejectReason('');
                router.refresh();
            } else {
                toast.error(result.error);
            }
        } catch (error) {
            toast.error('Gagal menolak permintaan. Silakan coba lagi.');
            console.error(error);
        } finally {
            setIsRejecting(false);
        }
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <div className="space-y-1">
                        <CardTitle>
                            {purchasingLabels.purchaseRequest}
                        </CardTitle>
                        <CardDescription>
                            Kelola permintaan pembelian bahan baku internal.
                        </CardDescription>
                    </div>
                    <div>
                        {selectedIds.length > 0 && (
                            <Button
                                onClick={() => handleActionClick()}
                                className="gap-2"
                            >
                                <Merge className="h-4 w-4" />
                                Konsolidasi ({selectedIds.length})
                            </Button>
                        )}
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[50px]">
                                    <Checkbox
                                        checked={
                                            selectedIds.length ===
                                                approvedRequests.length &&
                                            approvedRequests.length > 0
                                        }
                                        onCheckedChange={(checked) =>
                                            handleSelectAll(checked as boolean)
                                        }
                                        disabled={
                                            approvedRequests.length === 0
                                        }
                                    />
                                </TableHead>
                                <TableHead>
                                    {purchasingLabels.prNumber}
                                </TableHead>
                                <TableHead>{formLabels.date}</TableHead>
                                <TableHead>
                                    {purchasingLabels.itemsCount}
                                </TableHead>
                                <TableHead>{purchasingLabels.source}</TableHead>
                                <TableHead>{formLabels.status}</TableHead>
                                <TableHead>Prioritas</TableHead>
                                <TableHead className="text-right">
                                    Aksi
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {requests.map((req) => (
                                <TableRow key={req.id}>
                                    <TableCell>
                                        <Checkbox
                                            checked={selectedIds.includes(
                                                req.id,
                                            )}
                                            onCheckedChange={(checked) =>
                                                handleSelect(
                                                    req.id,
                                                    checked as boolean,
                                                )
                                            }
                                            disabled={req.status !== 'APPROVED'}
                                        />
                                    </TableCell>
                                    <TableCell className="font-medium">
                                        {req.requestNumber}
                                    </TableCell>
                                    <TableCell>
                                        {format(
                                            new Date(req.requestDate),
                                            'dd MMM yyyy',
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-col gap-1">
                                            {req.items.map((item) => (
                                                <div
                                                    key={item.id}
                                                    className="text-sm"
                                                >
                                                    <span className="font-semibold">
                                                        {item.quantity.toString()}
                                                    </span>{' '}
                                                    x {item.productVariant.name}
                                                </div>
                                            ))}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        {req.salesOrder ? (
                                            <Badge variant="outline">
                                                SO: {req.salesOrder.orderNumber}
                                            </Badge>
                                        ) : (
                                            '-'
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-col gap-1">
                                            <Badge
                                                variant={
                                                    STATUS_BADGE_VARIANT[
                                                        req.status
                                                    ] ?? 'secondary'
                                                }
                                            >
                                                {getStatusLabel(
                                                    req.status,
                                                    'purchasing',
                                                )}
                                            </Badge>
                                            {req.status === 'REJECTED' &&
                                                req.rejectionReason && (
                                                    <div className="text-xs text-muted-foreground mt-1">
                                                        <span className="font-medium">
                                                            Alasan:
                                                        </span>{' '}
                                                        {req.rejectionReason}
                                                    </div>
                                                )}
                                            {req.status === 'REJECTED' &&
                                                req.reviewedBy && (
                                                    <div className="text-xs text-muted-foreground">
                                                        oleh{' '}
                                                        {req.reviewedBy.name ??
                                                            'Unknown'}
                                                        {req.reviewedAt &&
                                                            ` · ${format(
                                                                new Date(
                                                                    req.reviewedAt,
                                                                ),
                                                                'dd MMM yyyy HH:mm',
                                                            )}`}
                                                    </div>
                                                )}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        {req.priority === 'URGENT' && (
                                            <Badge variant="destructive">
                                                URGENT
                                            </Badge>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            {req.status === 'OPEN' &&
                                                canApprove && (
                                                    <>
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                                            onClick={() =>
                                                                handleApprove(
                                                                    req.id,
                                                                )
                                                            }
                                                            disabled={
                                                                approvingId ===
                                                                req.id
                                                            }
                                                        >
                                                            {approvingId ===
                                                            req.id ? (
                                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                            ) : (
                                                                <CheckCircle className="h-4 w-4 mr-1" />
                                                            )}
                                                            Setujui
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                                            onClick={() =>
                                                                handleOpenReject(
                                                                    req.id,
                                                                )
                                                            }
                                                        >
                                                            <XCircle className="h-4 w-4 mr-1" />
                                                            Tolak
                                                        </Button>
                                                    </>
                                                )}
                                            {req.status === 'APPROVED' && (
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() =>
                                                        handleActionClick(
                                                            req.id,
                                                        )
                                                    }
                                                >
                                                    Konsolidasi
                                                </Button>
                                            )}
                                            {req.status === 'CONVERTED' && (
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    disabled
                                                >
                                                    {getStatusLabel(
                                                        'CONVERTED',
                                                        'purchasing',
                                                    )}
                                                </Button>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {requests.length === 0 && (
                                <TableRow>
                                    <TableCell
                                        colSpan={8}
                                        className="text-center py-8 text-muted-foreground"
                                    >
                                        {purchasingLabels.emptyRequests}
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Consolidate Dialog */}
            <Dialog open={isConvertOpen} onOpenChange={setIsConvertOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {selectedIds.length > 1
                                ? `Konsolidasi ${selectedIds.length} Permintaan`
                                : 'Konversi ke Purchase Order'}
                        </DialogTitle>
                        <DialogDescription>
                            Pilih supplier untuk membuat Purchase Order dari
                            permintaan yang dipilih. Item akan digabungkan
                            berdasarkan varian produk.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="py-4">
                        <label className="text-sm font-medium mb-2 block">
                            {purchasingLabels.supplier}
                        </label>
                        <Select
                            value={selectedSupplier}
                            onValueChange={setSelectedSupplier}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Pilih supplier..." />
                            </SelectTrigger>
                            <SelectContent>
                                {suppliers.map((s) => (
                                    <SelectItem key={s.id} value={s.id}>
                                        {s.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setIsConvertOpen(false)}
                        >
                            {actionLabels.cancel}
                        </Button>
                        <Button
                            onClick={handleConfirmConvert}
                            disabled={!selectedSupplier || isConverting}
                        >
                            {isConverting && (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            )}
                            Buat Draft PO
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Reject Reason Dialog */}
            <Dialog open={isRejectOpen} onOpenChange={setIsRejectOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Tolak Permintaan</DialogTitle>
                        <DialogDescription>
                            Berikan alasan penolakan permintaan pembelian ini.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="py-4">
                        <Textarea
                            placeholder="Alasan penolakan (wajib diisi)..."
                            value={rejectReason}
                            onChange={(e) =>
                                setRejectReason(e.target.value)
                            }
                            rows={3}
                        />
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setIsRejectOpen(false)}
                        >
                            {actionLabels.cancel}
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleConfirmReject}
                            disabled={!rejectReason.trim() || isRejecting}
                        >
                            {isRejecting && (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            )}
                            Tolak Permintaan
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
