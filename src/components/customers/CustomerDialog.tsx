'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createCustomerSchema, updateCustomerSchema, CreateCustomerValues, UpdateCustomerValues } from '@/lib/zod-schemas';
import { createCustomer, updateCustomer } from '@/actions/customer';
import { Customer } from '@prisma/client';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Loader2, Plus, Pencil } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface CustomerDialogProps {
    mode: 'create' | 'edit';
    initialData?: Customer;
    trigger?: React.ReactNode;
}

export function CustomerDialog({ mode, initialData, trigger }: CustomerDialogProps) {
    const [open, setOpen] = useState(false);
    const router = useRouter();

    const form = useForm<CreateCustomerValues | UpdateCustomerValues>({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        resolver: zodResolver(mode === 'create' ? createCustomerSchema : updateCustomerSchema) as any,
        defaultValues: mode === 'edit' && initialData ? {
            id: initialData.id,
            name: initialData.name,
            code: initialData.code || '',
            phone: initialData.phone || '',
            email: initialData.email || '',
            billingAddress: initialData.billingAddress || '',
            shippingAddress: initialData.shippingAddress || '',
            taxId: initialData.taxId || '',
            creditLimit: initialData.creditLimit ? Number(initialData.creditLimit) : 0,
            paymentTermDays: initialData.paymentTermDays || 0,
            discountPercent: initialData.discountPercent ? Number(initialData.discountPercent) : 0,
            notes: initialData.notes || '',
        } : {
            name: '',
            code: '',
            phone: '',
            email: '',
            billingAddress: '',
            shippingAddress: '',
            taxId: '',
            creditLimit: 0,
            paymentTermDays: 0,
            discountPercent: 0,
            notes: '',
        },
    });

    async function onSubmit(data: CreateCustomerValues | UpdateCustomerValues) {
        const result = mode === 'create'
            ? await createCustomer(data as CreateCustomerValues)
            : await updateCustomer(data as UpdateCustomerValues);

        if (result.success) {
            toast.success(`Customer ${mode === 'create' ? 'created' : 'updated'} successfully`);
            setOpen(false);
            if (mode === 'create') form.reset();
            router.refresh();
        } else {
            toast.error(result.error || `Failed to ${mode} customer`);
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger || (
                    <Button variant={mode === 'create' ? 'default' : 'ghost'} size={mode === 'create' ? 'default' : 'icon'}>
                        {mode === 'create' ? (
                            <>
                                <Plus className="h-4 w-4 mr-2" />
                                Add Customer
                            </>
                        ) : (
                            <Pencil className="h-4 w-4" />
                        )}
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle>{mode === 'create' ? 'Add Customer' : 'Edit Customer'}</DialogTitle>
                </DialogHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Name *</FormLabel>
                                        <FormControl>
                                            <Input placeholder="Customer Name" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="code"
                                render={({ field }) => (
                                    <FormItem>
                                        <div className="flex justify-between items-center">
                                            <FormLabel>Code</FormLabel>
                                            {mode === 'create' && (
                                                <span className="text-[0.8rem] text-muted-foreground">
                                                    (Auto-generated if empty)
                                                </span>
                                            )}
                                        </div>
                                        <FormControl>
                                            <Input
                                                placeholder={mode === 'create' ? "Auto-generated" : "CUS-XXX"}
                                                {...field}
                                                disabled={mode === 'edit'}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="phone"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Phone</FormLabel>
                                        <FormControl>
                                            <Input placeholder="+62..." {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="email"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Email</FormLabel>
                                        <FormControl>
                                            <Input placeholder="email@example.com" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="billingAddress"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Billing Address</FormLabel>
                                        <FormControl>
                                            <Textarea placeholder="Address..." {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="shippingAddress"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Shipping Address</FormLabel>
                                        <FormControl>
                                            <Textarea placeholder="Address..." {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                            <FormField
                                control={form.control}
                                name="taxId"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Tax ID (NPWP)</FormLabel>
                                        <FormControl>
                                            <Input placeholder="" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="creditLimit"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Credit Limit</FormLabel>
                                        <FormControl>
                                            <Input type="number" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="paymentTermDays"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Terms (Days)</FormLabel>
                                        <FormControl>
                                            <Input type="number" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="discountPercent"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Discount (%)</FormLabel>
                                        <FormControl>
                                            <Input type="number" step="0.1" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <FormField
                            control={form.control}
                            name="notes"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Notes</FormLabel>
                                    <FormControl>
                                        <Textarea placeholder="Internal notes..." {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <div className="flex justify-end gap-2 pt-4">
                            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={form.formState.isSubmitting}>
                                {form.formState.isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                {mode === 'create' ? 'Create Customer' : 'Save Changes'}
                            </Button>
                        </div>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
