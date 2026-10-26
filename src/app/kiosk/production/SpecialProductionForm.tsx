'use client';

import { startTransition, useCallback, useRef, useState } from 'react';
import { submitKioskDailyReports } from '@/actions/production/kiosk-daily-report';
import { useFieldArray, useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2, PlusCircle, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { productionOutputSchema } from '@/lib/schemas/production';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { kioskButton } from '@/components/kiosk/ui/kiosk-button';
import { KioskPill } from '@/components/kiosk/ui/KioskPill';
import { KioskSegmented } from '@/components/kiosk/ui/KioskSegmented';
import { getProductionUnitMeta } from '@/lib/utils/production-units';
import { formatShiftOptionLabel } from '@/lib/production/shift-label';
import { getProductionShiftsByOrder } from '@/actions/production/production-shifts';
import { newClientRequestId } from '@/lib/production/kiosk-packaging';
import { readDailyReportOutcome } from '@/lib/production/daily-report-outcome';
import {
    toDailyReportPayload,
    type DailyReportFormProps,
} from './daily-report-entry';

// Same validation rules as the endpoint; only the operator-facing messages differ.
const nonnegative = (message: string) =>
    z.coerce
        .number({ error: 'Masukkan angka yang valid' })
        .nonnegative(message);
const bulkSchema = z.object({
    reports: z.array(
        productionOutputSchema.extend({
            productionOrderId: z.string().min(1, 'SPK wajib dipilih'),
            quantityProduced: nonnegative('Jumlah hasil tidak boleh negatif'),
            scrapQuantity: nonnegative('Affal tidak boleh negatif').default(0),
            scrapProngkolQty: nonnegative('Affal tidak boleh negatif').default(
                0,
            ),
            scrapDaunQty: nonnegative('Affal tidak boleh negatif').default(0),
            bruto: nonnegative('Bruto tidak boleh negatif').optional(),
            bobin: nonnegative('Bobin tidak boleh negatif').optional(),
            startTime: z.coerce.date({ error: 'Waktu mulai tidak valid' }),
            endTime: z.coerce.date({ error: 'Waktu selesai tidak valid' }),
        }),
    ),
});
type BulkFormValues = z.infer<typeof bulkSchema>;
type Report = BulkFormValues['reports'][number];
type Shift = {
    id: string;
    shiftName: string;
    startTime: Date | string;
    endTime: Date | string;
};
type NumericField =
    | 'bruto'
    | 'bobin'
    | 'quantityProduced'
    | 'scrapProngkolQty'
    | 'scrapDaunQty';
const VARIANTS = {
    hd: {
        title: 'HD',
        fields: [
            'bruto',
            'bobin',
            'quantityProduced',
            'scrapProngkolQty',
            'scrapDaunQty',
        ],
    },
} as const;
const LABELS: Record<NumericField, string> = {
    bruto: 'Bruto (KG)',
    bobin: 'Bobin (KG)',
    quantityProduced: 'Netto',
    scrapProngkolQty: 'Scrap Prongkol (KG)',
    scrapDaunQty: 'Scrap Daun (KG)',
};
const inputClass =
    'min-h-12 w-full rounded-xl border-2 bg-background text-foreground text-base md:text-base placeholder:text-foreground data-[placeholder]:text-foreground';

function toLocalDatetime(date: Date | string): string {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '';
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
}
function makeEmpty(operatorId: string): Report {
    return {
        productionOrderId: '',
        clientRequestId: newClientRequestId(),
        machineId: '',
        operatorId,
        helperIds: [],
        shiftId: '',
        quantityProduced: 0,
        scrapQuantity: 0,
        scrapProngkolQty: 0,
        scrapDaunQty: 0,
        bruto: 0,
        bobin: 0,
        cekGram: '',
        startTime: new Date(),
        endTime: new Date(),
        notes: '',
    };
}

export default function SpecialProductionForm({
    variant,
    orders,
    machines,
    employees,
    operator,
}: DailyReportFormProps & {
    variant: keyof typeof VARIANTS;
}) {
    const router = useRouter();
    const config = VARIANTS[variant];
    const submitting = useRef(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [entryErrors, setEntryErrors] = useState<Record<string, string>>({});
    const [shiftsByOrder, setShiftsByOrder] = useState<Record<string, Shift[]>>(
        {},
    );
    const [loadingShifts, setLoadingShifts] = useState<Record<string, boolean>>(
        {},
    );
    const form = useForm<BulkFormValues>({
        resolver: zodResolver(bulkSchema) as Resolver<BulkFormValues>,
        defaultValues: { reports: [makeEmpty(operator.id)] },
    });
    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: 'reports',
    });
    const fetchShiftsForOrder = useCallback(
        async (orderId: string) => {
            if (!orderId || shiftsByOrder[orderId]) return;
            setLoadingShifts((prev) => ({ ...prev, [orderId]: true }));
            try {
                const result = await getProductionShiftsByOrder(orderId);
                if (result.success && result.data)
                    setShiftsByOrder((prev) => ({
                        ...prev,
                        [orderId]: result.data,
                    }));
            } catch {
                toast.error(
                    'Shift gagal dimuat. Pilih ulang SPK untuk mencoba lagi.',
                );
            } finally {
                setLoadingShifts((prev) => ({ ...prev, [orderId]: false }));
            }
        },
        [shiftsByOrder],
    );

    const onSubmit = (data: BulkFormValues) => {
        if (submitting.current) return;
        submitting.current = true;
        setIsSubmitting(true);
        setEntryErrors({});
        startTransition(async () => {
            try {
                const reports = data.reports.map((report) =>
                    toDailyReportPayload(report, orders),
                );
                const response = await submitKioskDailyReports(reports);
                if (!response.success) {
                    toast.error(response.error);
                    return;
                }
                const json = response.data;
                if (json.status === 207) {
                    const outcome = readDailyReportOutcome(
                        reports.map((report) => report.clientRequestId ?? ''),
                        json,
                    );
                    remove(outcome.savedIndexes);
                    setEntryErrors(outcome.errorsById);
                    toast.warning(
                        `${outcome.savedIndexes.length} laporan tersimpan, ${Object.keys(outcome.errorsById).length} gagal. Perbaiki entri bertanda merah lalu kirim lagi.`,
                    );
                    return;
                }
                toast.success(
                    `${json.count ?? reports.length} laporan berhasil disimpan.`,
                );
                form.reset({ reports: [makeEmpty(operator.id)] });
                router.refresh();
            } catch {
                toast.error(
                    'Gagal menyimpan data produksi. Silakan coba lagi.',
                );
            } finally {
                submitting.current = false;
                setIsSubmitting(false);
            }
        });
    };

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="space-y-2 rounded-xl border-2 border-border bg-card p-4">
                    <p className="font-semibold">
                        Operator PIN: {operator.name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                        Ganti operator melalui hub. Helper boleh dipilih dari
                        seluruh karyawan aktif.
                    </p>
                    <p className="rounded-lg bg-kiosk-warn-soft p-3 text-kiosk-warn-ink">
                        Jika absensi belum lengkap, laporan tetap dapat dikirim.
                        Lengkapi absensi secara terpisah.
                    </p>
                </div>
                <fieldset
                    disabled={isSubmitting}
                    className="min-w-0 space-y-6"
                    aria-busy={isSubmitting}
                >
                    {fields.map((entry, index) => {
                        const report = form.watch(`reports.${index}`);
                        const order = orders.find(
                            (item) => item.id === report.productionOrderId,
                        );
                        const unitMeta = getProductionUnitMeta(
                            order?.bom?.productVariant || {},
                        );
                        const shifts =
                            shiftsByOrder[report.productionOrderId] || [];
                        const entryError =
                            entryErrors[report.clientRequestId ?? ''];
                        const choices = [
                            {
                                name: 'productionOrderId',
                                label: 'SPK',
                                placeholder: 'Pilih SPK...',
                                options: orders.map((o) => ({
                                    id: o.id,
                                    name: `${o.orderNumber} - ${o.bom?.productVariant?.name || ''}`,
                                })),
                            },
                            {
                                name: 'machineId',
                                label: 'Mesin',
                                placeholder: 'Pilih mesin...',
                                options: machines,
                            },
                        ] as const;
                        return (
                            <section
                                key={entry.id}
                                aria-label={`Entri ${index + 1}`}
                                className={`min-w-0 space-y-5 rounded-2xl border-2 p-4 md:p-6 ${entryError ? 'border-kiosk-stop bg-kiosk-stop-soft' : 'border-border bg-card'}`}
                            >
                                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
                                    <h2 className="flex flex-wrap items-center gap-2 text-lg font-bold text-foreground">
                                        <KioskPill tone="info">
                                            {index + 1}
                                        </KioskPill>{' '}
                                        Laporan {config.title}
                                        {entryError && (
                                            <KioskPill tone="stop">
                                                Gagal disimpan
                                            </KioskPill>
                                        )}
                                    </h2>
                                    {fields.length > 1 && (
                                        <button
                                            type="button"
                                            className={kioskButton({
                                                tone: 'stop',
                                            })}
                                            onClick={() => remove(index)}
                                        >
                                            <Trash2 aria-hidden="true" /> Hapus
                                        </button>
                                    )}
                                </div>
                                {entryError && (
                                    <p
                                        role="alert"
                                        className="font-semibold text-kiosk-stop-ink"
                                    >
                                        Gagal disimpan: {entryError}
                                    </p>
                                )}
                                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                    {choices.map((choice) => (
                                        <FormField
                                            key={choice.name}
                                            control={form.control}
                                            name={`reports.${index}.${choice.name}`}
                                            render={({ field }) => (
                                                <FormItem className="min-w-0">
                                                    <FormLabel>
                                                        {choice.label}
                                                    </FormLabel>
                                                    <Select
                                                        value={field.value}
                                                        disabled={isSubmitting}
                                                        onValueChange={(
                                                            value,
                                                        ) => {
                                                            field.onChange(
                                                                value,
                                                            );
                                                            if (
                                                                choice.name ===
                                                                'productionOrderId'
                                                            )
                                                                void fetchShiftsForOrder(
                                                                    value,
                                                                );
                                                        }}
                                                    >
                                                        <FormControl>
                                                            <SelectTrigger
                                                                className={`${inputClass} data-[size=default]:h-auto`}
                                                            >
                                                                <SelectValue
                                                                    placeholder={
                                                                        choice.placeholder
                                                                    }
                                                                />
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent position="popper">
                                                            {choice.options.map(
                                                                (option) => (
                                                                    <SelectItem
                                                                        key={
                                                                            option.id
                                                                        }
                                                                        value={
                                                                            option.id
                                                                        }
                                                                        className="min-h-12 text-base"
                                                                    >
                                                                        {
                                                                            option.name
                                                                        }
                                                                    </SelectItem>
                                                                ),
                                                            )}
                                                        </SelectContent>
                                                    </Select>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    ))}
                                </div>
                                <FormField
                                    control={form.control}
                                    name={`reports.${index}.shiftId`}
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Shift</FormLabel>
                                            {loadingShifts[
                                                report.productionOrderId
                                            ] ? (
                                                <p role="status">
                                                    Memuat shift...
                                                </p>
                                            ) : shifts.length ? (
                                                <KioskSegmented
                                                    label={`Shift entri ${index + 1}`}
                                                    value={field.value}
                                                    onChange={field.onChange}
                                                    options={shifts.map(
                                                        (shift) => ({
                                                            value: shift.id,
                                                            label: formatShiftOptionLabel(
                                                                shift,
                                                            ),
                                                        }),
                                                    )}
                                                />
                                            ) : (
                                                <p className="text-sm text-muted-foreground">
                                                    {report.productionOrderId
                                                        ? 'Belum ada shift di SPK ini'
                                                        : 'Pilih SPK dulu'}
                                                </p>
                                            )}
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name={`reports.${index}.helperIds`}
                                    render={({ field }) => {
                                        const helpers = field.value ?? [];
                                        const eligible = employees.filter(
                                            (employee) =>
                                                employee.id !==
                                                report.operatorId,
                                        );
                                        return (
                                            <FormItem>
                                                <div className="flex flex-wrap items-center gap-2 font-medium">
                                                    <Users
                                                        className="size-5"
                                                        aria-hidden="true"
                                                    />{' '}
                                                    Helper / Asisten
                                                    {helpers.length > 0 && (
                                                        <KioskPill tone="info">
                                                            {helpers.length}{' '}
                                                            dipilih
                                                        </KioskPill>
                                                    )}
                                                </div>
                                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                                                    {eligible.map(
                                                        (employee) => (
                                                            <label
                                                                key={
                                                                    employee.id
                                                                }
                                                                className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border-2 px-3 py-2 ${helpers.includes(employee.id) ? 'border-kiosk-info bg-kiosk-info-soft text-foreground' : 'border-border bg-background text-foreground'}`}
                                                            >
                                                                <Checkbox
                                                                    checked={helpers.includes(
                                                                        employee.id,
                                                                    )}
                                                                    className="size-5 border-2 border-muted-foreground"
                                                                    onCheckedChange={() =>
                                                                        field.onChange(
                                                                            helpers.includes(
                                                                                employee.id,
                                                                            )
                                                                                ? helpers.filter(
                                                                                      (
                                                                                          id,
                                                                                      ) =>
                                                                                          id !==
                                                                                          employee.id,
                                                                                  )
                                                                                : [
                                                                                      ...helpers,
                                                                                      employee.id,
                                                                                  ],
                                                                        )
                                                                    }
                                                                />
                                                                {employee.name}
                                                            </label>
                                                        ),
                                                    )}
                                                    {!eligible.length && (
                                                        <p className="text-sm text-muted-foreground">
                                                            Tidak ada helper
                                                            lain.
                                                        </p>
                                                    )}
                                                </div>
                                                <FormMessage />
                                            </FormItem>
                                        );
                                    }}
                                />
                                <div className="grid grid-cols-1 gap-4 rounded-xl bg-muted/40 p-4 sm:grid-cols-2 lg:grid-cols-3">
                                    {config.fields.map((name) => (
                                        <FormField
                                            key={name}
                                            control={form.control}
                                            name={`reports.${index}.${name}`}
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>
                                                        {name ===
                                                        'quantityProduced'
                                                            ? `Netto / Valid (${unitMeta.displayUnit})`
                                                            : LABELS[name]}
                                                    </FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            type="number"
                                                            step="any"
                                                            className={`${inputClass} font-bold`}
                                                            {...field}
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    ))}
                                    {variant === 'hd' && (
                                        <FormField
                                            control={form.control}
                                            name={`reports.${index}.cekGram`}
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>
                                                        Cek Gram
                                                    </FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            {...field}
                                                            placeholder="Contoh: 12g"
                                                            className={
                                                                inputClass
                                                            }
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    )}
                                </div>
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    {(['startTime', 'endTime'] as const).map(
                                        (name) => (
                                            <FormField
                                                key={name}
                                                control={form.control}
                                                name={`reports.${index}.${name}`}
                                                render={({ field }) => (
                                                    <FormItem className="min-w-0">
                                                        <FormLabel>
                                                            {name ===
                                                            'startTime'
                                                                ? 'Mulai Pukul'
                                                                : 'Selesai Pukul'}
                                                        </FormLabel>
                                                        <FormControl>
                                                            <Input
                                                                type="datetime-local"
                                                                className={
                                                                    inputClass
                                                                }
                                                                value={
                                                                    field.value
                                                                        ? toLocalDatetime(
                                                                              field.value,
                                                                          )
                                                                        : ''
                                                                }
                                                                onChange={(e) =>
                                                                    field.onChange(
                                                                        new Date(
                                                                            e
                                                                                .target
                                                                                .value,
                                                                        ),
                                                                    )
                                                                }
                                                            />
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                        ),
                                    )}
                                </div>
                            </section>
                        );
                    })}
                    <div className="flex flex-col gap-3 rounded-2xl border-2 border-border bg-card p-4 sm:flex-row sm:justify-between">
                        <button
                            type="button"
                            className={kioskButton()}
                            onClick={() => append(makeEmpty(operator.id))}
                        >
                            <PlusCircle aria-hidden="true" /> Tambah entri
                        </button>
                        <button
                            type="submit"
                            className={kioskButton({ tone: 'go', size: 'lg' })}
                            disabled={
                                !fields.length ||
                                fields.some((_, index) => {
                                    const report = form.watch(
                                        `reports.${index}`,
                                    );
                                    return Boolean(
                                        report.productionOrderId &&
                                        (
                                            shiftsByOrder[
                                                report.productionOrderId
                                            ] || []
                                        ).length &&
                                        !report.shiftId,
                                    );
                                })
                            }
                        >
                            <CheckCircle2 aria-hidden="true" />{' '}
                            {isSubmitting ? 'Mengirim...' : 'Kirim laporan'}
                        </button>
                    </div>
                </fieldset>
            </form>
        </Form>
    );
}
