'use client';

import { useState } from 'react';
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Plus, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { createProductionIssue } from '@/actions/production/production';

interface AddIssueDialogProps {
    orderId: string;
    disabled?: boolean;
}

const ISSUE_CATEGORIES = [
    { value: 'MACHINE_BREAKDOWN', label: 'Kerusakan Mesin', description: 'Mesin rusak atau error' },
    { value: 'MATERIAL_DEFECT', label: 'Cacat Material', description: 'Bahan baku bermasalah' },
    { value: 'QUALITY_ISSUE', label: 'Masalah Kualitas', description: 'Hasil tidak sesuai standar' },
    { value: 'OPERATOR_ERROR', label: 'Kesalahan Operator', description: 'Kesalahan operator' },
    { value: 'OTHER', label: 'Lainnya', description: 'Masalah lainnya' },
] as const;

export function AddIssueDialog({ orderId, disabled }: AddIssueDialogProps) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [category, setCategory] = useState<string>('');
    const [description, setDescription] = useState('');

    const handleSubmit = async () => {
        if (!category || !description.trim()) {
            toast.error('Isi semua kolom terlebih dahulu');
            return;
        }

        setIsSubmitting(true);
        try {
            const result = await createProductionIssue({
                productionOrderId: orderId,
                category: category as 'MACHINE_BREAKDOWN' | 'MATERIAL_DEFECT' | 'QUALITY_ISSUE' | 'OPERATOR_ERROR' | 'OTHER',
                description: description.trim()
            });

            if (result.success) {
                toast.success('Masalah berhasil dicatat');
                setOpen(false);
                setCategory('');
                setDescription('');
                router.refresh();
            } else {
                toast.error(result.error || 'Gagal mencatat masalah');
            }
        } catch (error) {
            console.error(error);
            toast.error('Gagal memproses. Silakan coba lagi.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button size="sm" variant="outline" disabled={disabled}>
                    <Plus className="w-4 h-4 mr-2" />
                    Catat Masalah
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-amber-500" />
                        Catat Masalah Produksi
                    </DialogTitle>
                    <DialogDescription>
                        Catat kendala yang terjadi selama produksi untuk dilacak dan diselesaikan.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="category">Kategori Masalah</Label>
                        <Select value={category} onValueChange={setCategory}>
                            <SelectTrigger>
                                <SelectValue placeholder="Pilih kategori..." />
                            </SelectTrigger>
                            <SelectContent>
                                {ISSUE_CATEGORIES.map((cat) => (
                                    <SelectItem key={cat.value} value={cat.value}>
                                        <div className="flex flex-col">
                                            <span>{cat.label}</span>
                                            <span className="text-xs text-muted-foreground">{cat.description}</span>
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="description">Deskripsi</Label>
                        <Textarea
                            id="description"
                            placeholder="Jelaskan masalah secara detail..."
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={4}
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>
                        Batal
                    </Button>
                    <Button onClick={handleSubmit} disabled={isSubmitting}>
                        {isSubmitting ? 'Mencatat...' : 'Catat Masalah'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
