'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { transactionWizardSchema, TransactionWizardValues } from '@/lib/schemas/transaction-wizard';
import { createWizardTransaction } from '@/actions/transaction-wizard';
import { TRANSACTION_TYPES, TransactionTypeConfig } from '@/lib/config/transaction-types';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { formatRupiah, cn } from '@/lib/utils';
import { Loader2, CalendarIcon, ChevronRight, ChevronLeft, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { AccountCombobox } from "./account-combobox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AccountingInput } from '../../ui/accounting-input';

interface Account {
    id: string;
    code: string;
    name: string;
}

interface Invoice {
    id: string;
    invoiceNumber: string;
    totalAmount: number | { toString(): string };
    paidAmount: number | { toString(): string };
    salesOrder: {
        customer: { name: string } | null;
    } | null;
}

interface PurchaseInvoice {
    id: string;
    invoiceNumber: string;
    totalAmount: number | { toString(): string };
    paidAmount: number | { toString(): string };
    purchaseOrder: {
        supplier: { name: string } | null;
    } | null;
}

interface TransactionWizardFormProps {
    accounts: Account[];
    salesInvoices?: Invoice[];
    purchaseInvoices?: PurchaseInvoice[];
}

export default function TransactionWizardForm({
    accounts,
    salesInvoices = [],
    purchaseInvoices = []
}: TransactionWizardFormProps) {
    const router = useRouter();
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [selectedType, setSelectedType] = useState<TransactionTypeConfig | null>(null);

    const form = useForm<TransactionWizardValues>({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        resolver: zodResolver(transactionWizardSchema) as any,
        defaultValues: {
            transactionTypeId: '',
            amount: 0,
            entryDate: new Date(),
            description: '',
            reference: '',
            customDebitAccountId: '',
            invoiceId: '',
        }
    });

    const { watch, setValue, trigger } = form;
    const values = watch();

    const handleSelectType = (config: TransactionTypeConfig) => {
        setSelectedType(config);
        setValue('transactionTypeId', config.id);
        setValue('description', config.defaultDescription);
        // Reset values for a clean start when type changes
        setValue('amount', 0);
        setValue('reference', '');
        setValue('customDebitAccountId', '');
        setValue('customCreditAccountId', '');
        setValue('invoiceId', '');
        setStep(2);
    };

    const nextStep = async () => {
        const fieldsToValidate: (keyof TransactionWizardValues)[] = step === 2
            ? ['amount', 'entryDate', 'description']
            : [];

        if (selectedType?.showAccountPicker) {
            fieldsToValidate.push('customDebitAccountId');
        }

        const isValid = await trigger(fieldsToValidate);
        if (isValid) {
            setStep(step + 1);
        }
    };

    const prevStep = () => {
        setStep(step - 1);
    };

    async function onSubmit(data: TransactionWizardValues) {
        setLoading(true);
        try {
            const result = await createWizardTransaction(data);
            if (result.success) {
                toast.success('Transaksi berhasil dicatat dan diposting');
                router.push('/finance/journals');
                router.refresh();
            } else {
                toast.error(result.error || 'Gagal mencatat transaksi');
            }
        } catch (_error) {
            toast.error('Terjadi kesalahan tidak terduga.');
        } finally {
            setLoading(false);
        }
    }

    const categories = Array.from(new Set(TRANSACTION_TYPES.map(t => t.category)));

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            {/* Step Indicator - Standardized */}
            <div className="flex items-center justify-center space-x-4">
                {[1, 2, 3].map((s) => (
                    <div key={s} className="flex items-center">
                        <div className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm transition-colors ring-2 ring-offset-2",
                            step === s ? "bg-primary text-primary-foreground ring-primary" :
                                (step > s ? "bg-primary text-primary-foreground ring-primary" : "bg-muted text-muted-foreground ring-transparent")
                        )}>
                            {step > s ? <CheckCircle2 className="w-5 h-5" /> : s}
                        </div>
                        {s < 3 && <div className={cn("h-0.5 w-16 mx-2", step > s ? "bg-primary" : "bg-muted")} />}
                    </div>
                ))}
            </div>

            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

                    {/* STEP 1: Select Type */}
                    {step === 1 && (
                        <Card className="border-t-4 border-t-indigo-500 shadow-sm">
                            <CardHeader>
                                <CardTitle className="text-xl">What would you like to record?</CardTitle>
                                <CardDescription>Select the transaction type to proceed.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Tabs defaultValue="EXPENSE" className="w-full">
                                    <TabsList className="flex w-full mb-6 overflow-x-auto bg-muted/30 p-1 h-auto">
                                        {categories.map(cat => (
                                            <TabsTrigger
                                                key={cat}
                                                value={cat}
                                                className="flex-1 py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm"
                                            >
                                                {cat === 'EXPENSE' ? 'Expenses' :
                                                    cat === 'FINANCING' ? 'Loans' :
                                                        cat === 'PAYMENT' ? 'Payments' :
                                                            cat === 'ASSET' ? 'Assets' : cat}
                                            </TabsTrigger>
                                        ))}
                                    </TabsList>

                                    {categories.map(category => (
                                        <TabsContent key={category} value={category} className="mt-0">
                                            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                                {TRANSACTION_TYPES.filter(t => t.category === category).map((config) => (
                                                    <button
                                                        key={config.id}
                                                        type="button"
                                                        onClick={() => handleSelectType(config)}
                                                        className={cn(
                                                            "flex flex-col text-left p-4 rounded-lg border transition-all hover:bg-muted/50",
                                                            values.transactionTypeId === config.id ? "border-primary ring-1 ring-primary" : "border-border"
                                                        )}
                                                    >
                                                        <div className={cn(
                                                            "w-10 h-10 rounded-md flex items-center justify-center mb-3",
                                                            values.transactionTypeId === config.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                                                        )}>
                                                            <config.icon className="w-5 h-5" />
                                                        </div>
                                                        <h3 className="font-semibold text-foreground mb-1">{config.label}</h3>
                                                        <p className="text-xs text-muted-foreground leading-relaxed">{config.description}</p>
                                                    </button>
                                                ))}
                                            </div>
                                        </TabsContent>
                                    ))}
                                </Tabs>
                            </CardContent>
                        </Card>
                    )}

                    {/* STEP 2: Details */}
                    {step === 2 && selectedType && (
                        <Card className="border-t-4 border-t-indigo-500 shadow-sm">
                            <CardHeader>
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center text-foreground">
                                        <selectedType.icon className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-xl">{selectedType.label}</CardTitle>
                                        <CardDescription>Enter the transaction details.</CardDescription>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                {selectedType.requiresInvoice && (
                                    <FormField
                                        control={form.control}
                                        name="invoiceId"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>
                                                    {selectedType.requiresInvoice === 'SALES' ? 'Pilih Invoice Customer' : 'Pilih Tagihan Supplier'}
                                                </FormLabel>
                                                <Select
                                                    value={field.value}
                                                    onValueChange={(val) => {
                                                        field.onChange(val);
                                                        // Automatically set amount based on selected invoice
                                                        if (selectedType.requiresInvoice === 'SALES') {
                                                            const inv = salesInvoices.find(i => i.id === val);
                                                            if (inv) {
                                                                const balance = Number(inv.totalAmount) - Number(inv.paidAmount);
                                                                setValue('amount', balance);
                                                                setValue('description', `Pelunasan ${inv.invoiceNumber} - ${inv.salesOrder?.customer?.name || 'Customer'}`);
                                                            }
                                                        } else {
                                                            const inv = purchaseInvoices.find(i => i.id === val);
                                                            if (inv) {
                                                                const balance = Number(inv.totalAmount) - Number(inv.paidAmount);
                                                                setValue('amount', balance);
                                                                setValue('description', `Pembayaran ${inv.invoiceNumber} - ${inv.purchaseOrder?.supplier?.name || 'Supplier'}`);
                                                            }
                                                        }
                                                    }}
                                                >
                                                    <FormControl>
                                                        <SelectTrigger>
                                                            <SelectValue placeholder="Pilih invoice yang akan dibayar" />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        {(selectedType.requiresInvoice === 'SALES' ? salesInvoices : purchaseInvoices).map((inv) => {
                                                            const balance = Number(inv.totalAmount) - Number(inv.paidAmount);
                                                            const partyName = selectedType.requiresInvoice === 'SALES'
                                                                ? (inv as Invoice).salesOrder?.customer?.name
                                                                : (inv as PurchaseInvoice).purchaseOrder?.supplier?.name;
                                                            return (
                                                                <SelectItem key={inv.id} value={inv.id}>
                                                                    {inv.invoiceNumber} - {partyName || 'Unknown'} ({formatRupiah(balance)})
                                                                </SelectItem>
                                                            );
                                                        })}
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                )}

                                <div className="grid gap-6 md:grid-cols-2">
                                    <div className="space-y-4">
                                        {values.invoiceId && (
                                            <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-md text-sm">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-indigo-700 font-medium">Sisa Tagihan:</span>
                                                    <span className="font-bold text-indigo-900">
                                                        {(() => {
                                                            const inv = selectedType.requiresInvoice === 'SALES'
                                                                ? (salesInvoices as Invoice[]).find(i => i.id === values.invoiceId)
                                                                : (purchaseInvoices as PurchaseInvoice[]).find(i => i.id === values.invoiceId);
                                                            return inv ? formatRupiah(Number(inv.totalAmount) - Number(inv.paidAmount)) : '0';
                                                        })()}
                                                    </span>
                                                </div>
                                            </div>
                                        )}

                                        <FormField
                                            control={form.control}
                                            name="amount"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Amount</FormLabel>
                                                    <FormControl>
                                                        <AccountingInput
                                                            value={field.value}
                                                            onValueChange={field.onChange}
                                                            className="text-lg font-semibold"
                                                        />
                                                    </FormControl>
                                                    {values.invoiceId && (
                                                        <p className="text-xs text-muted-foreground mt-1">
                                                            Pstt! Anda bisa mengubah nominal ini jika ingin membayar cicilan/sebagian.
                                                        </p>
                                                    )}
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="entryDate"
                                            render={({ field }) => (
                                                <FormItem className="flex flex-col">
                                                    <FormLabel>Date</FormLabel>
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

                                    <div className="space-y-4">
                                        <FormField
                                            control={form.control}
                                            name="description"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Description</FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="e.g. Purchase of raw materials" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="reference"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Reference (Optional)</FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="Invoice / WO Number" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        {selectedType.showAccountPicker && (
                                            <FormField
                                                control={form.control}
                                                name="customDebitAccountId"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>
                                                            {selectedType.category === 'FINANCING' ? 'Uang Masuk ke Mana?' :
                                                                selectedType.category === 'ASSET' ? 'Pilih Akun Aset' : 'Expense Account'}
                                                        </FormLabel>
                                                        <FormControl>
                                                            <AccountCombobox
                                                                accounts={accounts.filter(acc =>
                                                                    selectedType.accountPickerFilter?.some(code => acc.code.startsWith(code))
                                                                )}
                                                                value={field.value || ''}
                                                                onValueChange={field.onChange}
                                                            />
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                        )}

                                        {selectedType.showPaymentPicker && (
                                            <FormField
                                                control={form.control}
                                                name="customCreditAccountId"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>{selectedType.category === 'FINANCING' ? 'Bayar Pakai Saldo Mana?' : 'Bayar Pakai Apa?'}</FormLabel>
                                                        <FormControl>
                                                            <AccountCombobox
                                                                accounts={accounts.filter(acc =>
                                                                    (selectedType.paymentPickerFilter || ['111', '211', '212', '221']).some(code => acc.code.startsWith(code))
                                                                )}
                                                                value={field.value || ''}
                                                                onValueChange={field.onChange}
                                                                placeholder="Pilih Kas atau Bank"
                                                            />
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                        )}
                                    </div>
                                </div>

                                <div className="flex justify-between pt-6 border-t">
                                    <Button variant="ghost" type="button" onClick={prevStep}>
                                        <ChevronLeft className="w-4 h-4 mr-2" /> Back
                                    </Button>
                                    <Button type="button" onClick={nextStep}>
                                        Continue to Confirm <ChevronRight className="w-4 h-4 ml-2" />
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* STEP 3: Confirm */}
                    {step === 3 && selectedType && (
                        <Card className="border-t-4 border-t-indigo-500 shadow-sm">
                            <CardHeader>
                                <CardTitle className="text-xl">Confirm Transaction</CardTitle>
                                <CardDescription>Please review the details before posting.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="grid gap-4 p-4 rounded-lg bg-muted/50 border">
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Type</span>
                                        <span className="font-medium text-foreground">{selectedType.label}</span>
                                    </div>
                                    <div className="flex justify-between border-t pt-2">
                                        <span className="text-muted-foreground">Amount</span>
                                        <span className="font-bold text-indigo-600 text-lg">{formatRupiah(values.amount)}</span>
                                    </div>
                                    <div className="flex justify-between border-t pt-2">
                                        <span className="text-muted-foreground">Date</span>
                                        <span className="text-foreground">{format(values.entryDate, "PPP")}</span>
                                    </div>
                                    <div className="flex justify-between border-t pt-2">
                                        <span className="text-muted-foreground">Description</span>
                                        <span className="text-foreground text-right max-w-[200px]">{values.description}</span>
                                    </div>
                                </div>

                                <div className="flex justify-between pt-6">
                                    <Button variant="ghost" type="button" onClick={prevStep}>
                                        <ChevronLeft className="w-4 h-4 mr-2" /> Back
                                    </Button>
                                    <Button type="submit" disabled={loading} className="bg-indigo-600 hover:bg-indigo-700">
                                        {loading ? (
                                            <>
                                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                Processing...
                                            </>
                                        ) : (
                                            'Post Transaction'
                                        )}
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </form>
            </Form>
        </div>
    );
}
