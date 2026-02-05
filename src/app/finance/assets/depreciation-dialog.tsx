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
import { Label } from '@/components/ui/label';
import { Calculator } from 'lucide-react';
import { runDepreciation } from '@/actions/accounting';
import { toast } from 'sonner';

export function DepreciationDialog() {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    const currentYear = new Date().getFullYear();
    const [year, setYear] = useState(currentYear.toString());
    const [month, setMonth] = useState((new Date().getMonth() + 1).toString());

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const res = await runDepreciation(parseInt(year), parseInt(month));
            if (res.success) {
                toast.success(`Processed depreciation for ${res.count} assets`);
                setOpen(false);
            } else {
                toast.error(res.error || 'Failed to run depreciation');
            }
        } catch (_error) {
            toast.error('An unexpected error occurred');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline">
                    <Calculator className="mr-2 h-4 w-4" />
                    Run Depreciation
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <form onSubmit={handleSubmit}>
                    <DialogHeader>
                        <DialogTitle>Monthly Depreciation</DialogTitle>
                        <DialogDescription>
                            Generate journals for all active fixed assets for the selected period.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="year" className="text-right">Year</Label>
                            <Select value={year} onValueChange={setYear}>
                                <SelectTrigger className="col-span-3">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {[currentYear - 1, currentYear].map(y => (
                                        <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="month" className="text-right">Month</Label>
                            <Select value={month} onValueChange={setMonth}>
                                <SelectTrigger className="col-span-3">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                                        <SelectItem key={m} value={m.toString()}>
                                            {new Date(2000, m - 1).toLocaleString('default', { month: 'long' })}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="submit" disabled={loading}>
                            {loading ? 'Processing...' : 'Run Now'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
