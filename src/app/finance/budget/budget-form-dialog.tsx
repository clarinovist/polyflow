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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus } from 'lucide-react';
import { setBudget } from '@/actions/accounting';
import { toast } from 'sonner';

interface Account {
    id: string;
    code: string;
    name: string;
}

export function BudgetFormDialog({ accounts, currentYear, currentMonth }: { accounts: Account[], currentYear: number, currentMonth: number }) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    const [formData, setFormData] = useState({
        accountId: '',
        year: currentYear.toString(),
        month: currentMonth.toString(),
        amount: '',
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const res = await setBudget({
                accountId: formData.accountId,
                year: parseInt(formData.year),
                month: parseInt(formData.month),
                amount: parseFloat(formData.amount)
            });
            if (res.success) {
                toast.success('Budget target set');
                setOpen(false);
            } else {
                toast.error(res.error || 'Failed to set budget');
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
                <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Set Target
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <form onSubmit={handleSubmit}>
                    <DialogHeader>
                        <DialogTitle>Set Budget Target</DialogTitle>
                        <DialogDescription>Define financial target for a specific account and month.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label>Account</Label>
                            <Select value={formData.accountId} onValueChange={val => setFormData({ ...formData, accountId: val })}>
                                <SelectTrigger><SelectValue placeholder="Select Account" /></SelectTrigger>
                                <SelectContent>
                                    {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Year</Label>
                                <Input type="number" required value={formData.year} onChange={e => setFormData({ ...formData, year: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                                <Label>Month (1-12)</Label>
                                <Input type="number" min="1" max="12" required value={formData.month} onChange={e => setFormData({ ...formData, month: e.target.value })} />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Budgeted Amount</Label>
                            <Input type="number" step="0.01" required value={formData.amount} onChange={e => setFormData({ ...formData, amount: e.target.value })} placeholder="0.00" />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="submit" disabled={loading}>{loading ? 'Saving...' : 'Save Target'}</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
