'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { assetSchema, AssetFormValues } from '@/lib/schemas/finance';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useState } from 'react';
import { toast } from 'sonner';
import { createAsset, updateAsset } from '@/actions/finance/asset-actions';
import { Account, FixedAsset } from '@prisma/client';
import { Plus } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';

interface AssetFormProps {
    existingAsset?: FixedAsset;
    accounts: Account[];
    onSuccess?: () => void;
}

export function AssetForm({ existingAsset, accounts, onSuccess }: AssetFormProps) {
    const [open, setOpen] = useState(false);

    // Filter accounts by type if possible, or just pass all
    // In a real app, you'd filter: Asset Accounts, Expense Accounts (Depreciation), Accum Depr Accounts

    const form = useForm<AssetFormValues>({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        resolver: zodResolver(assetSchema) as any,
        defaultValues: {
            name: existingAsset?.name || '',
            assetCode: existingAsset?.assetCode || '',
            category: existingAsset?.category || '',
            purchaseDate: existingAsset?.purchaseDate ? new Date(existingAsset.purchaseDate) : new Date(),
            purchaseValue: existingAsset?.purchaseValue ? Number(existingAsset.purchaseValue) : 0,
            scrapValue: existingAsset?.scrapValue ? Number(existingAsset.scrapValue) : 0,
            usefulLifeMonths: existingAsset?.usefulLifeMonths || 12,
            depreciationMethod: existingAsset?.depreciationMethod || 'STRAIGHT_LINE',
            status: existingAsset?.status || 'ACTIVE',
            assetAccountId: existingAsset?.assetAccountId || '',
            depreciationAccountId: existingAsset?.depreciationAccountId || '',
            accumulatedDepreciationAccountId: existingAsset?.accumulatedDepreciationAccountId || '',
        }
    });

    const onSubmit = async (data: AssetFormValues) => {
        try {
            if (existingAsset) {
                await updateAsset(existingAsset.id, data);
                toast.success('Asset updated successfully');
            } else {
                await createAsset(data);
                toast.success('Asset created successfully');
            }
            setOpen(false);
            form.reset();
            onSuccess?.();
        } catch (error) {
            toast.error('Failed to save asset');
            console.error(error);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant={existingAsset ? "ghost" : "default"}>
                    {existingAsset ? "Edit" : <><Plus className="mr-2 h-4 w-4" /> Add Asset</>}
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{existingAsset ? 'Edit Asset' : 'New Fixed Asset'}</DialogTitle>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="assetCode"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Asset Code</FormLabel>
                                        <FormControl>
                                            <Input placeholder="AST-001" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Asset Name</FormLabel>
                                        <FormControl>
                                            <Input placeholder="Office Building" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="category"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Category</FormLabel>
                                        <FormControl>
                                            <Input placeholder="Machinery, Building, etc." {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="purchaseDate"
                                render={({ field }) => (
                                    <FormItem className="flex flex-col">
                                        <FormLabel>Purchase Date</FormLabel>
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <FormControl>
                                                    <Button
                                                        variant={"outline"}
                                                        className={cn(
                                                            "w-full pl-3 text-left font-normal",
                                                            !field.value && "text-muted-foreground"
                                                        )}
                                                    >
                                                        {field.value ? (
                                                            format(field.value, "PPP")
                                                        ) : (
                                                            <span>Pick a date</span>
                                                        )}
                                                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                                    </Button>
                                                </FormControl>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0" align="start">
                                                <Calendar
                                                    mode="single"
                                                    selected={field.value}
                                                    onSelect={field.onChange}
                                                    disabled={(date) =>
                                                        date > new Date() || date < new Date("1900-01-01")
                                                    }
                                                    initialFocus
                                                />
                                            </PopoverContent>
                                        </Popover>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                            <FormField
                                control={form.control}
                                name="purchaseValue"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Purchase Value</FormLabel>
                                        <FormControl>
                                            <Input type="number" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="scrapValue"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Scrap Value</FormLabel>
                                        <FormControl>
                                            <Input type="number" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="usefulLifeMonths"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Useful Life (Months)</FormLabel>
                                        <FormControl>
                                            <Input type="number" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <div className="border-t pt-4">
                            <h3 className="mb-4 text-sm font-medium text-muted-foreground">GL Accounts</h3>
                            <div className="grid grid-cols-1 gap-4">
                                <FormField
                                    control={form.control}
                                    name="assetAccountId"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Asset Account</FormLabel>
                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select Asset Account" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    {accounts.map((acc) => (
                                                        <SelectItem key={acc.id} value={acc.id}>
                                                            {acc.code} - {acc.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="depreciationAccountId"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Depreciation Expense Account</FormLabel>
                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select Depre. Expense Account" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    {accounts.map((acc) => (
                                                        <SelectItem key={acc.id} value={acc.id}>
                                                            {acc.code} - {acc.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="accumulatedDepreciationAccountId"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Accumulated Depreciation Account</FormLabel>
                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select Accum. Depr. Account" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    {accounts.map((acc) => (
                                                        <SelectItem key={acc.id} value={acc.id}>
                                                            {acc.code} - {acc.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                            <Button type="submit">Save</Button>
                        </div>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
