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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Edit2 } from 'lucide-react';
import { AccountType, AccountCategory } from '@prisma/client';
import { createAccount, updateAccount } from '@/actions/accounting';
import { toast } from 'sonner';

const CATEGORIES: Record<string, string[]> = {
    ASSET: ['CURRENT_ASSET', 'FIXED_ASSET', 'OTHER_ASSET'],
    LIABILITY: ['CURRENT_LIABILITY', 'LONG_TERM_LIABILITY'],
    EQUITY: ['CAPITAL', 'RETAINED_EARNINGS'],
    REVENUE: ['OPERATING_REVENUE', 'OTHER_REVENUE'],
    EXPENSE: ['COGS', 'OPERATING_EXPENSE', 'OTHER_EXPENSE'],
};

interface AccountInfo {
    id: string;
    code: string;
    name: string;
    type: AccountType;
    category: AccountCategory;
    description?: string | null;
}

interface AccountFormDialogProps {
    account?: AccountInfo;
    mode?: 'create' | 'edit';
}

export function AccountFormDialog({ account, mode = 'create' }: AccountFormDialogProps) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        code: account?.code || '',
        name: account?.name || '',
        type: (account?.type || 'ASSET') as AccountType,
        category: (account?.category || 'CURRENT_ASSET') as AccountCategory,
        description: account?.description || ''
    });

    const categoriesForType = CATEGORIES[formData.type] || [];

    const handleTypeChange = (type: AccountType) => {
        const defaultCategory = CATEGORIES[type][0] as AccountCategory;
        setFormData({ ...formData, type, category: defaultCategory });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const data = {
                code: formData.code,
                name: formData.name,
                type: formData.type,
                category: formData.category,
                description: formData.description
            };

            const result = mode === 'create'
                ? await createAccount(data)
                : await updateAccount(account!.id, data);

            if (result.success) {
                toast.success(mode === 'create' ? 'Account created successfully' : 'Account updated successfully');
                setOpen(false);
                if (mode === 'create') {
                    setFormData({ code: '', name: '', type: 'ASSET' as AccountType, category: 'CURRENT_ASSET' as AccountCategory, description: '' });
                }
            } else {
                toast.error(result.error || 'Failed to save account');
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
                {mode === 'create' ? (
                    <Button>
                        <Plus className="mr-2 h-4 w-4" />
                        Add Account
                    </Button>
                ) : (
                    <Button variant="ghost" size="icon">
                        <Edit2 className="h-4 w-4" />
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <form onSubmit={handleSubmit}>
                    <DialogHeader>
                        <DialogTitle>{mode === 'create' ? 'Add New Account' : 'Edit Account'}</DialogTitle>
                        <DialogDescription>
                            Enter the details for the account below. Account code must be unique.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="code" className="text-right">Code</Label>
                            <Input
                                id="code"
                                value={formData.code}
                                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                                className="col-span-3 font-mono"
                                required
                                placeholder="e.g. 1101"
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="name" className="text-right">Name</Label>
                            <Input
                                id="name"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                className="col-span-3"
                                required
                                placeholder="e.g. Cash at Bank"
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="type" className="text-right">Type</Label>
                            <Select
                                value={formData.type}
                                onValueChange={(v) => handleTypeChange(v as AccountType)}
                            >
                                <SelectTrigger className="col-span-3">
                                    <SelectValue placeholder="Select type" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ASSET">ASSET</SelectItem>
                                    <SelectItem value="LIABILITY">LIABILITY</SelectItem>
                                    <SelectItem value="EQUITY">EQUITY</SelectItem>
                                    <SelectItem value="REVENUE">REVENUE</SelectItem>
                                    <SelectItem value="EXPENSE">EXPENSE</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="category" className="text-right">Category</Label>
                            <Select
                                value={formData.category}
                                onValueChange={(v) => setFormData({ ...formData, category: v as AccountCategory })}
                            >
                                <SelectTrigger className="col-span-3">
                                    <SelectValue placeholder="Select category" />
                                </SelectTrigger>
                                <SelectContent>
                                    {categoriesForType.map(cat => (
                                        <SelectItem key={cat} value={cat}>{cat.replace('_', ' ')}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="description" className="text-right">Notes</Label>
                            <Textarea
                                id="description"
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                className="col-span-3"
                                placeholder="Optional description..."
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                        <Button type="submit" disabled={loading}>
                            {loading ? 'Saving...' : 'Save Changes'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
