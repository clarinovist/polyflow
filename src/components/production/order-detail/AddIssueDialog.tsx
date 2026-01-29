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
import { createProductionIssue } from '@/actions/production';

interface AddIssueDialogProps {
    orderId: string;
    disabled?: boolean;
}

const ISSUE_CATEGORIES = [
    { value: 'MACHINE_BREAKDOWN', label: 'Machine Breakdown', description: 'Mesin rusak atau error' },
    { value: 'MATERIAL_DEFECT', label: 'Material Defect', description: 'Bahan baku bermasalah' },
    { value: 'QUALITY_ISSUE', label: 'Quality Issue', description: 'Hasil tidak sesuai standar' },
    { value: 'OPERATOR_ERROR', label: 'Operator Error', description: 'Kesalahan operator' },
    { value: 'OTHER', label: 'Other', description: 'Masalah lainnya' },
] as const;

export function AddIssueDialog({ orderId, disabled }: AddIssueDialogProps) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [category, setCategory] = useState<string>('');
    const [description, setDescription] = useState('');

    const handleSubmit = async () => {
        if (!category || !description.trim()) {
            toast.error('Please fill all fields');
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
                toast.success('Issue recorded successfully');
                setOpen(false);
                setCategory('');
                setDescription('');
                router.refresh();
            } else {
                toast.error(result.error || 'Failed to record issue');
            }
        } catch (error) {
            console.error(error);
            toast.error('An unexpected error occurred');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button size="sm" variant="outline" disabled={disabled}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Issue
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-amber-500" />
                        Record Production Issue
                    </DialogTitle>
                    <DialogDescription>
                        Log a problem encountered during production. This helps track and resolve issues.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="category">Issue Category</Label>
                        <Select value={category} onValueChange={setCategory}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select category..." />
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
                        <Label htmlFor="description">Description</Label>
                        <Textarea
                            id="description"
                            placeholder="Describe the issue in detail..."
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={4}
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>
                        Cancel
                    </Button>
                    <Button onClick={handleSubmit} disabled={isSubmitting}>
                        {isSubmitting ? 'Recording...' : 'Record Issue'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
