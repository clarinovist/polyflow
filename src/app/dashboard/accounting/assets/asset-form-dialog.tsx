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
import { createFixedAsset } from '@/actions/accounting';
import { toast } from 'sonner';

interface Account {
    id: string;
    code: string;
    name: string;
    type: string;
    category: string;
}

export function AssetFormDialog({ accounts }: { accounts: Account[] }) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    const assetAccounts = accounts.filter(a => a.category === 'FIXED_ASSET');
    const expenseAccounts = accounts.filter(a => a.type === 'EXPENSE');

    const [formData, setFormData] = useState({
        assetCode: '',
        name: '',
        category: 'Machine',
        purchaseDate: new Date().toISOString().split('T')[0],
        purchaseValue: '',
        scrapValue: '0',
        usefulLifeMonths: '60',
        assetAccountId: '',
        depreciationAccountId: '',
        accumulatedDepreciationAccountId: '',
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const res = await createFixedAsset({
                ...formData,
                purchaseDate: new Date(formData.purchaseDate),
                purchaseValue: Number(formData.purchaseValue),
                usefulLifeMonths: Number(formData.usefulLifeMonths),
            });
            if (res.success) {
                toast.success('Asset registered successfully');
                setOpen(false);
            } else {
                toast.error(res.error || 'Failed to create asset');
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
                    Register Asset
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
                <form onSubmit={handleSubmit}>
                    <DialogHeader>
                        <DialogTitle>Register Fixed Asset</DialogTitle>
                        <DialogDescription>Enter acquisition details and accounting mappings.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Asset Code</Label>
                                <Input required value={formData.assetCode} onChange={e => setFormData({ ...formData, assetCode: e.target.value })} placeholder="ASSET-001" />
                            </div>
                            <div className="space-y-2">
                                <Label>Asset Name</Label>
                                <Input required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="Injection Machine" />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Purchase Date</Label>
                                <Input type="date" required value={formData.purchaseDate} onChange={e => setFormData({ ...formData, purchaseDate: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                                <Label>Useful Life (Months)</Label>
                                <Input type="number" required value={formData.usefulLifeMonths} onChange={e => setFormData({ ...formData, usefulLifeMonths: e.target.value })} />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Purchase Value</Label>
                                <Input type="number" required value={formData.purchaseValue} onChange={e => setFormData({ ...formData, purchaseValue: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                                <Label>Scrap Value</Label>
                                <Input type="number" required value={formData.scrapValue} onChange={e => setFormData({ ...formData, scrapValue: e.target.value })} />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Asset Account (GL)</Label>
                            <Select value={formData.assetAccountId} onValueChange={val => setFormData({ ...formData, assetAccountId: val })}>
                                <SelectTrigger><SelectValue placeholder="Select Account" /></SelectTrigger>
                                <SelectContent>
                                    {assetAccounts.map(a => <SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Depr. Expense Account</Label>
                                <Select value={formData.depreciationAccountId} onValueChange={val => setFormData({ ...formData, depreciationAccountId: val })}>
                                    <SelectTrigger><SelectValue placeholder="Expense Acc" /></SelectTrigger>
                                    <SelectContent>
                                        {expenseAccounts.map(a => <SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Accum. Depr. Account</Label>
                                <Select value={formData.accumulatedDepreciationAccountId} onValueChange={val => setFormData({ ...formData, accumulatedDepreciationAccountId: val })}>
                                    <SelectTrigger><SelectValue placeholder="Contra Asset Acc" /></SelectTrigger>
                                    <SelectContent>
                                        {assetAccounts.map(a => <SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="submit" disabled={loading}>{loading ? 'Saving...' : 'Register'}</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
