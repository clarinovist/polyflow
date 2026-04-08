'use client';

import { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createMaklonReturnSchema, CreateMaklonReturnValues } from '@/lib/schemas/returns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Trash2, ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createMaklonReturnAction } from '@/actions/maklon/maklon-return';
import Link from 'next/link';

type FormProps = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    customers: any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    locations: any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    products: any[];
    initialData?: CreateMaklonReturnValues & { id?: string };
};

export function MaklonReturnForm({ customers, locations, products, initialData }: FormProps) {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const form = useForm<CreateMaklonReturnValues>({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        resolver: zodResolver(createMaklonReturnSchema) as any,
        defaultValues: initialData || {
            returnNumber: `MRT-${new Date().getTime()}`,
            customerId: '',
            sourceLocationId: '',
            reason: '',
            notes: '',
            items: [{
                productVariantId: '',
                quantity: 1,
                notes: ''
            }]
        }
    });

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: 'items'
    });

    const onSubmit = async (data: CreateMaklonReturnValues) => {
        setIsSubmitting(true);
        try {
            const res = await createMaklonReturnAction(data);
            if (res.success) {
                toast.success('Maklon return created successfully');
                router.push('/dashboard/maklon/returns');
            } else {
                throw new Error(res.error);
            }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
            toast.error(error.message || 'Failed to save return');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                <div className="flex items-center justify-between">
                    <Button type="button" variant="ghost" asChild>
                        <Link href="/dashboard/maklon/returns">
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Back to Returns
                        </Link>
                    </Button>
                    <div className="flex gap-2">
                        <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? 'Saving...' : 'Create Return'}
                        </Button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card>
                        <CardHeader><CardTitle>General Information</CardTitle></CardHeader>
                        <CardContent className="space-y-4">
                            <FormField
                                control={form.control}
                                name="returnNumber"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Return Number *</FormLabel>
                                        <FormControl>
                                            <Input {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="customerId"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Customer *</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value || undefined}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select Customer" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {customers.map(c => (
                                                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="sourceLocationId"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Dispatch Location *</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value || undefined}>
                                            <FormControl>
                                                <SelectTrigger><SelectValue placeholder="Select Location" /></SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {locations.map(loc => (
                                                    <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader><CardTitle>Return Details</CardTitle></CardHeader>
                        <CardContent className="space-y-4">
                            <FormField
                                control={form.control}
                                name="reason"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Reason</FormLabel>
                                        <FormControl>
                                            <Input {...field} placeholder="Reason for return..." value={field.value || ''} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="notes"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Notes</FormLabel>
                                        <FormControl>
                                            <Textarea {...field} placeholder="Additional details..." value={field.value || ''} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </CardContent>
                    </Card>
                </div>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle>Returned Items</CardTitle>
                        <Button type="button" variant="outline" size="sm" onClick={() => append({ productVariantId: '', quantity: 1, notes: '' })}>
                            <Plus className="h-4 w-4 mr-2" /> Add Item
                        </Button>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {fields.map((field, index) => (
                            <div key={field.id} className="grid grid-cols-12 gap-4 items-end border p-4 rounded-md">
                                <div className="col-span-12 md:col-span-5">
                                    <FormField
                                        control={form.control}
                                        name={`items.${index}.productVariantId`}
                                        render={({ field: itemField }) => (
                                            <FormItem>
                                                <FormLabel>Product *</FormLabel>
                                                <Select 
                                                    onValueChange={itemField.onChange} 
                                                    value={itemField.value}
                                                >
                                                    <FormControl>
                                                        <SelectTrigger><SelectValue placeholder="Product" /></SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        {products.map(p => (
                                                            <SelectItem key={p.id} value={p.id}>
                                                                {p.skuCode} - {p.name}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                                <div className="col-span-6 md:col-span-2">
                                    <FormField
                                        control={form.control}
                                        name={`items.${index}.quantity`}
                                        render={({ field: itemField }) => (
                                            <FormItem>
                                                <FormLabel>Qty *</FormLabel>
                                                <FormControl>
                                                    <Input type="number" min="0.01" step="0.01" className="no-stepper" {...itemField} onChange={e => itemField.onChange(parseFloat(e.target.value))} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                                <div className="col-span-5 md:col-span-4">
                                    <FormField
                                        control={form.control}
                                        name={`items.${index}.notes`}
                                        render={({ field: itemField }) => (
                                            <FormItem>
                                                <FormLabel>Item Notes</FormLabel>
                                                <FormControl>
                                                    <Input {...itemField} placeholder="Optional" value={itemField.value || ''} />
                                                </FormControl>
                                            </FormItem>
                                        )}
                                    />
                                </div>
                                <div className="col-span-1 md:col-span-1 text-right">
                                    <Button type="button" variant="destructive" size="icon" onClick={() => remove(index)} disabled={fields.length === 1}>
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            </form>
        </Form>
    );
}
