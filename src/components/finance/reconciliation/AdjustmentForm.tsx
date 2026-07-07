'use client';

import { useState, useEffect } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { addAdjustment } from '@/actions/finance/reconciliation-actions';
import { useToast } from '@/hooks/use-toast';
import { formatRupiah } from '@/lib/utils/utils';
import { Loader2 } from 'lucide-react';

interface AdjustmentFormProps {
    reconciliationId: string;
    onAdded: () => void;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const BANK_TYPES = [
    { value: 'DEPOSIT_IN_TRANSIT', label: 'Setoran dalam proses (+)' },
    { value: 'OUTSTANDING_CHECK', label: 'Cek dalam peredaran (-)' },
] as const;

const BOOK_TYPES = [
    { value: 'BANK_FEE', label: 'Biaya administrasi bank (-)' },
    { value: 'INTEREST_INCOME', label: 'Pendapatan bunga (+)' },
    { value: 'NSF_CHECK', label: 'Cek ditolak / NSF (-)' },
    { value: 'COLLECTION', label: 'Penagihan inkaso (+)' },
    { value: 'CORRECTION_ADD', label: 'Koreksi penambahan (+)' },
    { value: 'CORRECTION_SUBTRACT', label: 'Koreksi pengurangan (-)' },
    { value: 'OTHER', label: 'Lainnya' },
] as const;

const ADJUSTMENT_SIGN: Record<string, '+' | '-' | '±'> = {
    DEPOSIT_IN_TRANSIT: '+',
    OUTSTANDING_CHECK: '-',
    BANK_FEE: '-',
    INTEREST_INCOME: '+',
    NSF_CHECK: '-',
    COLLECTION: '+',
    CORRECTION_ADD: '+',
    CORRECTION_SUBTRACT: '-',
    OTHER: '±',
};

export function AdjustmentForm({
    reconciliationId,
    onAdded,
    open,
    onOpenChange,
}: AdjustmentFormProps) {
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [side, setSide] = useState<'BANK' | 'BOOK'>('BANK');
    const [type, setType] = useState('');
    const [description, setDescription] = useState('');
    const [amount, setAmount] = useState('');

    const typeOptions = side === 'BANK' ? BANK_TYPES : BOOK_TYPES;

    // Reset form when dialog closes
    useEffect(() => {
        if (!open) {
            setSide('BANK');
            setType('');
            setDescription('');
            setAmount('');
        }
    }, [open]);

    // Reset type when side changes (since options differ)
    useEffect(() => {
        if (!typeOptions.find((t) => t.value === type)) {
            setType('');
        }
    }, [side]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const parsedAmount = parseFloat(amount);
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
            toast({
                title: 'Error',
                description: 'Masukkan jumlah yang valid (lebih dari 0).',
                variant: 'destructive',
            });
            return;
        }

        if (!type) {
            toast({
                title: 'Error',
                description: 'Pilih jenis penyesuaian.',
                variant: 'destructive',
            });
            return;
        }

        if (!description.trim()) {
            toast({
                title: 'Error',
                description: 'Masukkan deskripsi penyesuaian.',
                variant: 'destructive',
            });
            return;
        }

        setLoading(true);

        try {
            const result = await addAdjustment(
                reconciliationId,
                side as "BANK" | "BOOK",
                type as "BANK_FEE" | "INTEREST_INCOME" | "NSF_CHECK" | "COLLECTION" | "CORRECTION_ADD" | "CORRECTION_SUBTRACT" | "DEPOSIT_IN_TRANSIT" | "OUTSTANDING_CHECK" | "OTHER",
                description.trim(),
                parsedAmount,
            );

            if (result.success) {
                toast({
                    title: 'Berhasil',
                    description: 'Penyesuaian berhasil ditambahkan.',
                });
                onAdded();
                onOpenChange(false);
            } else {
                toast({
                    title: 'Gagal',
                    description: result.error,
                    variant: 'destructive',
                });
            }
        } catch {
            toast({
                title: 'Gagal',
                description: 'Gagal menambahkan penyesuaian. Silakan coba lagi.',
                variant: 'destructive',
            });
        } finally {
            setLoading(false);
        }
    };

    const selectedSign = type ? ADJUSTMENT_SIGN[type] : '±';

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                    <DialogTitle>Tambah Penyesuaian Rekonsiliasi</DialogTitle>
                    <DialogDescription>
                        Tambahkan item penyesuaian ke sisi bank atau buku besar.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Side Selector */}
                    <div className="space-y-2">
                        <Label>Sisi</Label>
                        <Select value={side} onValueChange={(v) => setSide(v as 'BANK' | 'BOOK')}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="BANK">Saldo Rekening Koran Bank</SelectItem>
                                <SelectItem value="BOOK">Saldo Menurut Perusahaan (Buku Besar)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Type Selector */}
                    <div className="space-y-2">
                        <Label>Jenis Penyesuaian</Label>
                        <Select value={type} onValueChange={setType}>
                            <SelectTrigger>
                                <SelectValue placeholder="Pilih jenis..." />
                            </SelectTrigger>
                            <SelectContent>
                                {typeOptions.map((opt) => (
                                    <SelectItem key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Description */}
                    <div className="space-y-2">
                        <Label htmlFor="adj-desc">Deskripsi</Label>
                        <Textarea
                            id="adj-desc"
                            placeholder="Deskripsi singkat penyesuaian..."
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={2}
                            required
                        />
                    </div>

                    {/* Amount */}
                    <div className="space-y-2">
                        <Label htmlFor="adj-amount">
                            Jumlah {selectedSign && <span className="text-muted-foreground ml-1">({selectedSign})</span>}
                        </Label>
                        <Input
                            id="adj-amount"
                            type="number"
                            step="0.01"
                            min="0.01"
                            placeholder="0"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            required
                        />
                        {amount && parseFloat(amount) > 0 && (
                            <p className="text-xs text-muted-foreground">
                                {selectedSign === '+'
                                    ? `Akan menambah ${formatRupiah(parseFloat(amount))} ke sisi ${side === 'BANK' ? 'bank' : 'buku besar'}`
                                    : selectedSign === '-'
                                        ? `Akan mengurangi ${formatRupiah(parseFloat(amount))} dari sisi ${side === 'BANK' ? 'bank' : 'buku besar'}`
                                        : `Nominal ${formatRupiah(parseFloat(amount))} — pastikan tanda (+/-) sudah benar`}
                            </p>
                        )}
                    </div>

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={loading}
                        >
                            Batal
                        </Button>
                        <Button type="submit" disabled={loading || !type || !description.trim()}>
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Tambah Penyesuaian
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
