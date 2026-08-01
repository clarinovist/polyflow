'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Trash2, Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
    assignCustomerAction,
    unassignCustomerAction,
} from '@/actions/sales/customer-assignment';
import { getSalesTeamAssignedCustomersAction } from '@/actions/sales/sales-team';
import { getCustomers } from '@/actions/sales/customer';

interface AssignedCustomer {
    id: string;
    customerId: string;
    userId: string;
    isPrimary: boolean;
    assignedAt: string;
    customer: {
        id: string;
        name: string;
        code: string | null;
    };
}

interface CustomerOption {
    id: string;
    name: string;
    code: string | null;
}

interface CustomerAssignmentDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    userId: string;
    userName: string;
    onAssignmentChange?: () => void;
}

export function CustomerAssignmentDialog({
    open,
    onOpenChange,
    userId,
    userName,
    onAssignmentChange,
}: CustomerAssignmentDialogProps) {
    const [assignments, setAssignments] = useState<AssignedCustomer[]>([]);
    const [customers, setCustomers] = useState<CustomerOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedCustomerId, setSelectedCustomerId] = useState('');
    const [assigning, setAssigning] = useState(false);
    const [unassigning, setUnassigning] = useState<string | null>(null);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [assignmentsResult, customersResult] = await Promise.all([
                getSalesTeamAssignedCustomersAction(userId),
                getCustomers(),
            ]);

            const assignmentsData =
                assignmentsResult &&
                typeof assignmentsResult === 'object' &&
                'data' in assignmentsResult
                    ? (assignmentsResult as { data: AssignedCustomer[] | null })
                          .data
                    : null;
            setAssignments(assignmentsData ?? []);

            const custData =
                customersResult &&
                typeof customersResult === 'object' &&
                'data' in customersResult
                    ? (customersResult as { data: CustomerOption[] | null })
                          .data
                    : null;
            setCustomers(custData ?? []);
        } catch {
            setAssignments([]);
            setCustomers([]);
        } finally {
            setLoading(false);
        }
    }, [userId]);

    useEffect(() => {
        if (open) {
            loadData();
        }
    }, [open, loadData]);

    const assignedCustomerIds = new Set(assignments.map((a) => a.customerId));
    const availableCustomers = customers.filter(
        (c) => !assignedCustomerIds.has(c.id),
    );

    async function handleAssign() {
        if (!selectedCustomerId) return;
        setAssigning(true);
        try {
            const result = await assignCustomerAction({
                customerId: selectedCustomerId,
                userId,
                isPrimary: true,
            });
            if (
                result &&
                typeof result === 'object' &&
                'success' in result &&
                !result.success
            ) {
                toast.error('Gagal assign customer');
                return;
            }
            toast.success('Customer berhasil di-assign');
            setSelectedCustomerId('');
            await loadData();
            onAssignmentChange?.();
        } catch {
            toast.error('Gagal assign customer');
        } finally {
            setAssigning(false);
        }
    }

    async function handleUnassign(customerId: string) {
        setUnassigning(customerId);
        try {
            const result = await unassignCustomerAction({
                customerId,
                userId,
            });
            if (
                result &&
                typeof result === 'object' &&
                'success' in result &&
                !result.success
            ) {
                toast.error('Gagal unassign customer');
                return;
            }
            toast.success('Customer berhasil di-unassign');
            await loadData();
            onAssignmentChange?.();
        } catch {
            toast.error('Gagal unassign customer');
        } finally {
            setUnassigning(null);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Customer - {userName}</DialogTitle>
                    <DialogDescription>
                        Kelola assignment customer untuk sales ini.
                    </DialogDescription>
                </DialogHeader>

                {loading ? (
                    <div className="flex items-center justify-center h-32">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* Assign new customer */}
                        <div className="flex items-center gap-2">
                            <Select
                                value={selectedCustomerId}
                                onValueChange={setSelectedCustomerId}
                            >
                                <SelectTrigger className="flex-1">
                                    <SelectValue placeholder="Pilih customer..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableCustomers.length === 0 ? (
                                        <SelectItem value="none" disabled>
                                            Semua customer sudah ter-assign
                                        </SelectItem>
                                    ) : (
                                        availableCustomers.map((c) => (
                                            <SelectItem key={c.id} value={c.id}>
                                                {c.name}
                                                {c.code ? ` (${c.code})` : ''}
                                            </SelectItem>
                                        ))
                                    )}
                                </SelectContent>
                            </Select>
                            <Button
                                size="sm"
                                onClick={handleAssign}
                                disabled={!selectedCustomerId || assigning}
                            >
                                {assigning ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Plus className="h-4 w-4" />
                                )}
                                Assign
                            </Button>
                        </div>

                        {/* Assigned customers list */}
                        {assignments.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                                Belum ada customer yang di-assign.
                            </div>
                        ) : (
                            <>
                                {/* Desktop */}
                                <div className="hidden md:block">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>
                                                    Nama Customer
                                                </TableHead>
                                                <TableHead>Kode</TableHead>
                                                <TableHead className="text-center">
                                                    Status
                                                </TableHead>
                                                <TableHead className="w-[80px] text-right">
                                                    Aksi
                                                </TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {assignments.map((a) => (
                                                <TableRow key={a.id}>
                                                    <TableCell className="font-medium">
                                                        {a.customer.name}
                                                    </TableCell>
                                                    <TableCell className="font-mono text-xs text-muted-foreground">
                                                        {a.customer.code || '-'}
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        <Badge
                                                            variant={
                                                                a.isPrimary
                                                                    ? 'default'
                                                                    : 'secondary'
                                                            }
                                                            className="text-[10px]"
                                                        >
                                                            {a.isPrimary
                                                                ? 'Primary'
                                                                : 'Secondary'}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() =>
                                                                handleUnassign(
                                                                    a.customerId,
                                                                )
                                                            }
                                                            disabled={
                                                                unassigning ===
                                                                a.customerId
                                                            }
                                                        >
                                                            {unassigning ===
                                                            a.customerId ? (
                                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                            ) : (
                                                                <Trash2 className="h-4 w-4 text-destructive" />
                                                            )}
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>

                                {/* Mobile */}
                                <div className="md:hidden space-y-2">
                                    {assignments.map((a) => (
                                        <div
                                            key={a.id}
                                            className="flex items-center justify-between border rounded-lg p-3"
                                        >
                                            <div>
                                                <p className="font-medium text-sm">
                                                    {a.customer.name}
                                                </p>
                                                <p className="text-xs text-muted-foreground font-mono">
                                                    {a.customer.code || '-'}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Badge
                                                    variant={
                                                        a.isPrimary
                                                            ? 'default'
                                                            : 'secondary'
                                                    }
                                                    className="text-[10px]"
                                                >
                                                    {a.isPrimary
                                                        ? 'Primary'
                                                        : 'Secondary'}
                                                </Badge>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() =>
                                                        handleUnassign(
                                                            a.customerId,
                                                        )
                                                    }
                                                    disabled={
                                                        unassigning ===
                                                        a.customerId
                                                    }
                                                >
                                                    {unassigning ===
                                                    a.customerId ? (
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                    ) : (
                                                        <Trash2 className="h-4 w-4 text-destructive" />
                                                    )}
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
