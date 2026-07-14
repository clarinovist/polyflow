'use client';

import { useState, useMemo } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { detailJournalSchema, DetailJournalValues } from '@/lib/schemas/journal';
import { createDetailJournalAction, updateDetailJournalAction } from '@/actions/finance/journal';
import {
  DETAIL_JOURNAL_TEMPLATES,
  findDefaultAccountId,
  type DetailJournalTemplateKey,
} from '@/lib/config/detail-journal-templates';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { formatRupiah } from '@/lib/utils/utils';
import { Trash, Plus, Loader2, CalendarIcon, Info } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { cn } from '@/lib/utils/utils';
import { AccountCombobox } from './account-combobox';
import { AccountingInput } from './accounting-input';
import { Label } from '@/components/ui/label';

interface Account {
  id: string;
  code: string;
  name: string;
}

interface DetailJournalFormProps {
  accounts: Account[];
  mode?: 'create' | 'edit';
  journalId?: string;
  defaultValues?: DetailJournalValues & { templateKey?: string };
}

const TEMPLATE_OPTIONS = Object.values(DETAIL_JOURNAL_TEMPLATES);

export default function DetailJournalForm({
  accounts,
  mode = 'create',
  journalId,
  defaultValues,
}: DetailJournalFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // Determine initial template
  const initialTemplateKey = defaultValues?.templateKey || defaultValues?.type || 'DIRECT_LABOR';
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string>(initialTemplateKey);
  const template = DETAIL_JOURNAL_TEMPLATES[selectedTemplateKey as DetailJournalTemplateKey];

  // Resolve default accounts from template
  const defaultPrimaryId = useMemo(() => {
    if (mode === 'edit' && defaultValues?.primaryAccountId) return defaultValues.primaryAccountId;
    return template ? findDefaultAccountId(accounts, template.primaryAccountCodes, template.primaryNameHints) || '' : '';
  }, [template, accounts, mode, defaultValues?.primaryAccountId]);

  const defaultCounterId = useMemo(() => {
    if (mode === 'edit' && defaultValues?.counterAccountId) return defaultValues.counterAccountId;
    return template ? findDefaultAccountId(accounts, template.counterAccountCodes, template.counterNameHints) || '' : '';
  }, [template, accounts, mode, defaultValues?.counterAccountId]);

  const form = useForm<DetailJournalValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(detailJournalSchema) as any,
    defaultValues: defaultValues || {
      type: initialTemplateKey,
      entryDate: new Date(),
      description: '',
      reference: '',
      primaryAccountId: defaultPrimaryId,
      counterAccountId: defaultCounterId,
      direction: template?.defaultDirection || 'OUTFLOW',
      details: [{ description: '', amount: 0 }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'details',
  });

  const { watch, setValue } = form;
  const details = watch('details');
  const primaryAccountId = watch('primaryAccountId');
  const counterAccountId = watch('counterAccountId');
  const direction = watch('direction');

  // Calculate total from details
  const totalDetail = details.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);

  // Preview journal lines — follows direction
  const previewLines = useMemo(() => {
    if (totalDetail <= 0 || !primaryAccountId || !counterAccountId) return [];

    if (direction === 'OUTFLOW') {
      return [
        { accountId: primaryAccountId, debit: totalDetail, credit: 0, description: watch('description') || template?.label || 'Detail Journal' },
        { accountId: counterAccountId, debit: 0, credit: totalDetail, description: watch('description') || template?.label || 'Detail Journal' },
      ];
    }

    // INFLOW
    return [
      { accountId: counterAccountId, debit: totalDetail, credit: 0, description: watch('description') || template?.label || 'Detail Journal' },
      { accountId: primaryAccountId, debit: 0, credit: totalDetail, description: watch('description') || template?.label || 'Detail Journal' },
    ];
  }, [totalDetail, primaryAccountId, counterAccountId, direction, watch, template]);

  const isBalanced = previewLines.length === 2;

  // Handle template change — reset defaults
  function handleTemplateChange(newKey: string) {
    const newTemplate = DETAIL_JOURNAL_TEMPLATES[newKey as DetailJournalTemplateKey];
    if (!newTemplate) return;

    setSelectedTemplateKey(newKey);
    setValue('type', newKey);
    setValue('direction', newTemplate.defaultDirection);

    // Set default accounts
    const primaryId = findDefaultAccountId(accounts, newTemplate.primaryAccountCodes, newTemplate.primaryNameHints) || '';
    const counterId = findDefaultAccountId(accounts, newTemplate.counterAccountCodes, newTemplate.counterNameHints) || '';
    setValue('primaryAccountId', primaryId);
    setValue('counterAccountId', counterId);
  }

  async function onSubmit(data: DetailJournalValues, post: boolean) {
    setLoading(true);
    try {
      let result;
      if (mode === 'edit' && journalId) {
        result = await updateDetailJournalAction(journalId, data, post);
      } else {
        result = await createDetailJournalAction(data, post);
      }

      if (result?.success) {
        const action = mode === 'edit' ? 'diperbarui' : 'dibuat';
        toast.success(post
          ? `Jurnal ${template?.label || 'Detail'} berhasil ${action} dan diposting.`
          : `Jurnal ${template?.label || 'Detail'} berhasil ${action} (DRAFT).`
        );
        if (mode === 'edit' && journalId) {
          router.push(`/finance/journals/${journalId}`);
        } else {
          router.push('/finance/journals');
        }
        router.refresh();
      } else {
        toast.error(result?.error || 'Gagal memproses jurnal');
      }
    } catch (_error) {
      toast.error('Gagal memproses jurnal. Periksa koneksi Anda dan coba lagi.');
    } finally {
      setLoading(false);
    }
  }

  const handleSaveDraft = form.handleSubmit((data) => onSubmit(data, false));
  const handleSavePost = form.handleSubmit((data) => onSubmit(data, true));

  return (
    <Form {...form}>
      <form onSubmit={handleSaveDraft} className="space-y-6">
        {/* Template Selector (create only) */}
        {mode === 'create' && (
          <Card>
            <CardContent className="p-4">
              <FormField
                control={form.control}
                name="type"
                render={() => (
                  <FormItem>
                    <FormLabel>Template</FormLabel>
                    <FormControl>
                      <Select
                        value={selectedTemplateKey}
                        onValueChange={handleTemplateChange}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Pilih template..." />
                        </SelectTrigger>
                        <SelectContent>
                          {TEMPLATE_OPTIONS.map((t) => (
                            <SelectItem key={t.key} value={t.key}>
                              {t.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>
        )}

        {/* Helper text for BPJS */}
        {template?.helperText && (
          <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50/50 p-3 text-sm text-blue-700">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{template.helperText}</span>
          </div>
        )}

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
                        variant="outline"
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
                  <Input placeholder="e.g., BKK-16/07/26" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Input placeholder={template?.descriptionPlaceholder || 'Description'} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Direction Toggle — only for templates with allowDirectionToggle (Piutang) */}
        {template?.allowDirectionToggle && (
          <Card>
            <CardContent className="p-4">
              <FormField
                control={form.control}
                name="direction"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Arah Transaksi</FormLabel>
                    <FormControl>
                      <RadioGroup
                        value={field.value}
                        onValueChange={field.onChange}
                        className="flex gap-6"
                      >
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="OUTFLOW" id="dir-outflow" />
                          <Label htmlFor="dir-outflow" className="cursor-pointer">
                            {template.outflowLabel || 'Keluar'}
                          </Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="INFLOW" id="dir-inflow" />
                          <Label htmlFor="dir-inflow" className="cursor-pointer">
                            {template.inflowLabel || 'Masuk'}
                          </Label>
                        </div>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>
        )}

        {/* Account Selection */}
        <Card>
          <CardContent className="p-4">
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="primaryAccountId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{template?.primaryAccountLabel || 'Akun Utama'}</FormLabel>
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

              <FormField
                control={form.control}
                name="counterAccountId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{template?.counterAccountLabel || 'Akun Lawan'}</FormLabel>
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
            </div>
          </CardContent>
        </Card>

        {/* Detail Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">No</TableHead>
                  <TableHead>{template?.detailNamePlaceholder || 'Nama / Keterangan'}</TableHead>
                  <TableHead className="w-[200px] text-right">Nominal</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fields.map((field, index) => (
                  <TableRow key={field.id}>
                    <TableCell className="text-muted-foreground">
                      {index + 1}
                    </TableCell>
                    <TableCell>
                      <FormField
                        control={form.control}
                        name={`details.${index}.description`}
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Input
                                placeholder={template?.detailNamePlaceholder || 'Nama'}
                                {...field}
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
                        name={`details.${index}.amount`}
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <AccountingInput
                                value={Number(field.value)}
                                onValueChange={(val: number) => field.onChange(val)}
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
                        disabled={fields.length <= 1}
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
                onClick={() => append({ description: '', amount: 0 })}
              >
                <Plus className="h-4 w-4 mr-2" /> Add Detail
              </Button>

              <div className="flex gap-8 text-sm font-medium">
                <div>
                  <span className="text-muted-foreground mr-2">Total:</span>
                  {formatRupiah(totalDetail)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Preview Generated Journal */}
        {isBalanced && (
          <Card className="border-green-200 bg-green-50/50">
            <CardContent className="p-4">
              <p className="text-sm font-medium text-green-700 mb-2">
                Preview Jurnal {direction === 'INFLOW' ? '(Penerimaan)' : '(Pengeluaran)'}
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewLines.map((line, idx) => {
                    const account = accounts.find(a => a.id === line.accountId);
                    return (
                      <TableRow key={idx}>
                        <TableCell>
                          <span className="font-medium">{account?.code}</span>
                          <span className="text-muted-foreground ml-2">{account?.name}</span>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {line.debit > 0 ? formatRupiah(line.debit) : '-'}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {line.credit > 0 ? formatRupiah(line.credit) : '-'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow className="bg-green-100 font-bold">
                    <TableCell colSpan={1} className="text-right">Total</TableCell>
                    <TableCell className="text-right">{formatRupiah(totalDetail)}</TableCell>
                    <TableCell className="text-right">{formatRupiah(totalDetail)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Action Buttons */}
        <div className="flex justify-end gap-3">
          {mode === 'edit' && (
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => router.back()}
            >
              Batal
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={loading || !isBalanced || totalDetail <= 0}
            onClick={handleSaveDraft}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === 'edit' ? 'Simpan Draft' : 'Save as Draft'}
          </Button>
          <Button
            type="button"
            disabled={loading || !isBalanced || totalDetail <= 0}
            onClick={handleSavePost}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === 'edit' ? 'Simpan & Post' : 'Save & Post'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
