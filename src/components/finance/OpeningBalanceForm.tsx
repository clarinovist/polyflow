'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { CalendarIcon, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { AccountingInput } from '../ui/accounting-input';
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { createOpeningBalance } from '@/actions/finance/opening-balance';
import { useRouter } from 'next/navigation';

const formSchema = z.object({
    type: z.enum(['AR', 'AP']),
    entityId: z.string().min(1, 'Customer/Vendor is required'),
    invoiceNumber: z.string().min(1, 'Invoice Number is required'),
    date: z.date(),
    dueDate: z.date(),
    amount: z.number().min(1, 'Amount must be greater than 0'),
    notes: z.string().optional(),
});

type OpeningBalanceFormValues = z.infer<typeof formSchema>;

interface OpeningBalanceFormProps {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    customers: any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    suppliers: any[];
}

export function OpeningBalanceForm({ customers, suppliers }: OpeningBalanceFormProps) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const router = useRouter();

    const form = useForm<OpeningBalanceFormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            type: 'AR',
            entityId: '',
            invoiceNumber: '',
            date: new Date(),
            dueDate: new Date(),
            amount: 0,
            notes: '',
        },
    });

    const type = form.watch('type');
    const entityList = type === 'AR' ? customers : suppliers;
    const entityLabel = type === 'AR' ? 'Customer' : 'Supplier';

    async function onSubmit(values: OpeningBalanceFormValues) {
        setIsSubmitting(true);
        try {
            const res = await createOpeningBalance(values);
            if (res.success) {
                toast.success('Opening Balance recorded successfully');
                form.reset({
                    type: values.type, // Keep same type for rapid entry
                    entityId: '',
                    invoiceNumber: '',
                    date: new Date(),
                    dueDate: new Date(),
                    amount: 0,
                    notes: '',
                });
                router.refresh();
            } else {
                toast.error(res.error || 'Failed to save');
            }
        } catch (_error) {
            toast.error('An unexpected error occurred');
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <Card className="max-w-2xl mx-auto">
            <CardHeader>
                <CardTitle>Opening Balance Wizard</CardTitle>
                <CardDescription>
                    Enter outstanding invoices from your previous system.
                    These will be recorded against <strong>Opening Balance Equity</strong>.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

                        <FormField
                            control={form.control}
                            name="type"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Entry Type</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select type" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="AR">Customer Receivable (Piutang)</SelectItem>
                                            <SelectItem value="AP">Supplier Payable (Hutang)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormDescription>
                                        Select &apos;Receivable&apos; if someone implies money to you. Select &apos;Payable&apos; if you owe money.
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <FormField
                                control={form.control}
                                name="entityId"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{entityLabel}</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder={`Select ${entityLabel}`} />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {entityList.map((entity) => (
                                                    <SelectItem key={entity.id} value={entity.id}>
                                                        {entity.name}
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
                                name="invoiceNumber"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Original Invoice #</FormLabel>
                                        <FormControl>
                                            <Input placeholder="e.g. INV-2023-001" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <FormField
                                control={form.control}
                                name="date"
                                render={({ field }) => (
                                    <FormItem className="flex flex-col">
                                        <FormLabel>Invoice Date</FormLabel>
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

                            <FormField
                                control={form.control}
                                name="dueDate"
                                render={({ field }) => (
                                    <FormItem className="flex flex-col">
                                        <FormLabel>Due Date</FormLabel>
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
                                                    initialFocus
                                                />
                                            </PopoverContent>
                                        </Popover>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <FormField
                            control={form.control}
                            name="amount"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Outstanding Amount (IDR)</FormLabel>
                                    <FormControl>
                                        <AccountingInput
                                            value={field.value}
                                            onValueChange={field.onChange}
                                            placeholder="0"
                                        />
                                    </FormControl>
                                    <FormDescription>
                                        Enter the remaining unpaid amount for this invoice.
                                    </FormDescription>
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
                                        <Textarea
                                            placeholder="Optional notes regarding this opening balance"
                                            className="resize-none"
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <div className="flex justify-end">
                            <Button type="submit" disabled={isSubmitting} className="w-full md:w-auto">
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Recording...
                                    </>
                                ) : (
                                    'Record Opening Balance'
                                )}
                            </Button>
                        </div>
                    </form>
                </Form>
            </CardContent>
        </Card>
    );
}
