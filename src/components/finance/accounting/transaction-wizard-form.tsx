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
import { formatRupiah } from '@/lib/utils';
import { Loader2, CalendarIcon, ChevronRight, ChevronLeft, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { AccountCombobox } from "./account-combobox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AccountingInput } from '../../ui/accounting-input';

interface Account {
    id: string;
    code: string;
    name: string;
}

export default function TransactionWizardForm({ accounts }: { accounts: Account[] }) {
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
            customDebitAccountId: ''
        }
    });

    const { watch, setValue, trigger } = form;
    const values = watch();

    const handleSelectType = (config: TransactionTypeConfig) => {
        setSelectedType(config);
        setValue('transactionTypeId', config.id);
        setValue('description', config.defaultDescription);
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
                                <Tabs defaultValue="PURCHASE" className="w-full">
                                    <TabsList className="grid w-full grid-cols-2 mb-6">
                                        <TabsTrigger value="PURCHASE">Purchases</TabsTrigger>
                                        <TabsTrigger value="EXPENSE">Expenses</TabsTrigger>
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
                                <div className="grid gap-6 md:grid-cols-2">
                                    <div className="space-y-4">
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
                                                        <FormLabel>Expense Account</FormLabel>
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
                                <CardDescription>Review the details before recording.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="bg-muted/50 rounded-lg p-6 border">
                                    <div className="grid gap-6 md:grid-cols-2">
                                        <div className="space-y-4">
                                            <div>
                                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Type</p>
                                                <div className="flex items-center gap-2">
                                                    <selectedType.icon className="w-4 h-4 text-primary" />
                                                    <p className="font-medium">{selectedType.label}</p>
                                                </div>
                                            </div>
                                            <div>
                                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Amount</p>
                                                <p className="text-xl font-bold">{formatRupiah(values.amount)}</p>
                                            </div>
                                        </div>
                                        <div className="space-y-4">
                                            <div>
                                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Date</p>
                                                <p className="font-medium">{format(values.entryDate, "PPP")}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Description</p>
                                                <p className="font-medium">{values.description}</p>
                                            </div>
                                        </div>
                                    </div>
                                    {values.reference && (
                                        <div className="mt-4 pt-4 border-t">
                                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Reference</p>
                                            <p className="font-medium">{values.reference}</p>
                                        </div>
                                    )}
                                </div>

                                <div className="rounded-lg border border-dashed p-4">
                                    <details className="group">
                                        <summary className="text-sm font-medium text-muted-foreground cursor-pointer flex items-center justify-between hover:text-foreground">
                                            View Journal Entry Simulation
                                            <ChevronRight className="w-4 h-4 transition-transform group-open:rotate-90" />
                                        </summary>
                                        <div className="mt-4 space-y-2 text-sm font-mono bg-muted/30 p-3 rounded border">
                                            <div className="flex justify-between text-green-600 font-semibold">
                                                <span>DR {selectedType.showAccountPicker && values.customDebitAccountId ? accounts.find(a => a.id === values.customDebitAccountId)?.name : selectedType.debitAccountCode}</span>
                                                <span>{formatRupiah(values.amount)}</span>
                                            </div>
                                            <div className="flex justify-between text-red-600 font-semibold pl-8">
                                                <span>CR {selectedType.creditAccountCode}</span>
                                                <span>{formatRupiah(values.amount)}</span>
                                            </div>
                                        </div>
                                    </details>
                                </div>

                                <div className="flex justify-between pt-6 border-t">
                                    <Button variant="ghost" type="button" onClick={prevStep}>
                                        <ChevronLeft className="w-4 h-4 mr-2" /> Back
                                    </Button>
                                    <Button
                                        type="submit"
                                        disabled={loading}
                                        className="min-w-[200px]"
                                    >
                                        {loading ? (
                                            <>
                                                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing...
                                            </>
                                        ) : (
                                            <>
                                                Record Transaction <CheckCircle2 className="w-4 h-4 ml-2" />
                                            </>
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
