'use client';

import { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { manualJournalSchema, ManualJournalValues } from '@/lib/schemas/journal';
import { createManualJournal } from '@/actions/journal';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatRupiah } from '@/lib/utils';
import { Trash, Plus, Loader2, CalendarIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { AccountCombobox } from "./account-combobox";
import { JOURNAL_TEMPLATES } from '@/lib/config/accounting-templates';
import { AccountingInput } from '../../ui/accounting-input';

interface Account {
    id: string;
    code: string;
    name: string;
}

export default function ManualJournalForm({ accounts }: { accounts: Account[] }) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);

    const form = useForm<ManualJournalValues>({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        resolver: zodResolver(manualJournalSchema) as any,
        defaultValues: {
            entryDate: new Date(),
            description: '',
            reference: '',
            lines: [
                { accountId: '', debit: 0, credit: 0, description: '' },
                { accountId: '', debit: 0, credit: 0, description: '' }
            ]
        }
    });

    const { fields, append, remove, replace } = useFieldArray({
        control: form.control,
        name: "lines"
    });

    const { watch } = form;
    const lines = watch('lines');

    // Calculate totals
    const totalDebit = lines.reduce((sum, line) => sum + (Number(line.debit) || 0), 0);
    const totalCredit = lines.reduce((sum, line) => sum + (Number(line.credit) || 0), 0);
    const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

    // Importing Templates logic
    const [templateOpen, setTemplateOpen] = useState(false);

    const applyTemplate = (templateId: string) => {
        const template = JOURNAL_TEMPLATES.find((t) => t.id === templateId);
        if (!template) return;

        const newLines = template.lines.map((line) => {
            const matchedAccount = accounts.find((acc) => acc.code === line.accountCode);

            return {
                accountId: matchedAccount ? matchedAccount.id : "",
                description: line.description || "",
                debit: 0,
                credit: 0
            };
        });

        replace(newLines);
        form.setValue('description', template.name);
        setTemplateOpen(false);
        toast.success(`Template "${template.name}" applied`);
    };

    async function onSubmit(data: ManualJournalValues, post: boolean) {
        setLoading(true);
        try {
            const result = await createManualJournal(data, post);
            if (result.success) {
                toast.success(post ? 'Journal Entry created and posted successfully' : 'Journal Entry created as DRAFT');
                router.push('/finance/journals');
                router.refresh();
            } else {
                toast.error(result.error || 'Failed to create journal');
            }
        } catch (_error) {
            toast.error('An unexpected error occurred. Please check your data and try again.');
        } finally {
            setLoading(false);
        }
    }

    const handleSaveDraft = form.handleSubmit((data) => onSubmit(data, false));
    const handleSavePost = form.handleSubmit((data) => onSubmit(data, true));

    return (
        <Form {...form}>
            <form onSubmit={handleSaveDraft} className="space-y-6">

                {/* Header Section */}
                <div className="grid gap-4 md:grid-cols-3">
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
                                            captionLayout="dropdown"
                                            fromYear={2000}
                                            toYear={new Date().getFullYear() + 1}
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
                        name="reference"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Reference</FormLabel>
                                <FormControl>
                                    <Input placeholder="e.g., ADJ-001" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="description"
                        render={({ field }) => (
                            <FormItem className="md:col-span-1">
                                <FormLabel className="flex justify-between items-center">
                                    Description
                                    <Popover open={templateOpen} onOpenChange={setTemplateOpen}>
                                        <PopoverTrigger asChild>
                                            <Button variant="outline" size="sm" className="h-6 text-xs px-2">
                                                Load Template
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-[200px] p-0" align="end">
                                            <div className="p-2">
                                                <p className="text-xs font-medium text-muted-foreground mb-2 px-2">Select Template</p>
                                                <div className="space-y-1">
                                                    {JOURNAL_TEMPLATES.map((t) => (
                                                        <Button
                                                            key={t.id}
                                                            variant="ghost"
                                                            size="sm"
                                                            className="w-full justify-start text-xs"
                                                            onClick={() => applyTemplate(t.id)}
                                                        >
                                                            {t.name}
                                                        </Button>
                                                    ))}
                                                </div>
                                            </div>
                                        </PopoverContent>
                                    </Popover>
                                </FormLabel>
                                <FormControl>
                                    <Input placeholder="e.g., Monthly Depreciation" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                {/* Lines Section */}
                <Card>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[300px]">Account</TableHead>
                                    <TableHead>Description (Optional)</TableHead>
                                    <TableHead className="w-[150px] text-right">Debit</TableHead>
                                    <TableHead className="w-[150px] text-right">Credit</TableHead>
                                    <TableHead className="w-[50px]"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {fields.map((field, index) => (
                                    <TableRow key={field.id}>
                                        <TableCell>
                                            <FormField
                                                control={form.control}
                                                name={`lines.${index}.accountId`}
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormControl>
                                                            <AccountCombobox
                                                                accounts={accounts}
                                                                value={field.value}
                                                                onValueChange={field.onChange}
                                                            />
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <FormField
                                                control={form.control}
                                                name={`lines.${index}.description`}
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormControl>
                                                            <Input {...field} />
                                                        </FormControl>
                                                    </FormItem>
                                                )}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <FormField
                                                control={form.control}
                                                name={`lines.${index}.debit`}
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormControl>
                                                            <AccountingInput
                                                                value={Number(field.value)}
                                                                onValueChange={(val: number) => {
                                                                    field.onChange(val);
                                                                    if (val > 0) {
                                                                        form.setValue(`lines.${index}.credit`, 0);
                                                                    }
                                                                }}
                                                            />
                                                        </FormControl>
                                                    </FormItem>
                                                )}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <FormField
                                                control={form.control}
                                                name={`lines.${index}.credit`}
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormControl>
                                                            <AccountingInput
                                                                value={Number(field.value)}
                                                                onValueChange={(val: number) => {
                                                                    field.onChange(val);
                                                                    if (val > 0) {
                                                                        form.setValue(`lines.${index}.debit`, 0);
                                                                    }
                                                                }}
                                                            />
                                                        </FormControl>
                                                    </FormItem>
                                                )}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => remove(index)}
                                                disabled={fields.length <= 2}
                                            >
                                                <Trash className="h-4 w-4 text-destructive" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                        <div className="p-4 border-t flex justify-between items-center bg-muted/20">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => append({ accountId: '', debit: 0, credit: 0, description: '' })}
                            >
                                <Plus className="h-4 w-4 mr-2" /> Add Line
                            </Button>

                            <div className="flex gap-8 text-sm font-medium">
                                <div>
                                    <span className="text-muted-foreground mr-2">Total Debit:</span>
                                    {formatRupiah(totalDebit)}
                                </div>
                                <div>
                                    <span className="text-muted-foreground mr-2">Total Credit:</span>
                                    {formatRupiah(totalCredit)}
                                </div>
                                <div className={cn(
                                    "px-2 py-1 rounded",
                                    isBalanced ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                                )}>
                                    {isBalanced ? "Balanced" : "Unbalanced"}
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <div className="flex justify-end gap-3">
                    <Button
                        type="button"
                        variant="outline"
                        disabled={loading || !isBalanced}
                        onClick={handleSaveDraft}
                    >
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save as Draft
                    </Button>
                    <Button
                        type="button"
                        disabled={loading || !isBalanced}
                        onClick={handleSavePost}
                    >
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save & Post
                    </Button>
                </div>
            </form>
        </Form>
    );
}
