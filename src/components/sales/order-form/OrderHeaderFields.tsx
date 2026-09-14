import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
    FormControl,
    FormDescription,
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
import { Calendar } from '@/components/ui/calendar';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { cn, formatRupiah } from '@/lib/utils/utils';
import { CalendarIcon, Loader2, Info } from 'lucide-react';
import { format } from 'date-fns';
import type { CreditExposure } from '@/services/sales/credit-service';
import type { SalesOrderType } from '@prisma/client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { salesLabels, formLabels } from '@/lib/labels';
import type { SalesOrderFormProps } from '../sales-order-types';
import { SalesOrderCustomerPicker } from '../SalesOrderCustomerPicker';
import type { Dispatch, SetStateAction } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import type { SalesOrderFormValues } from './types';

type OrderHeaderFieldsProps = {
    form: UseFormReturn<SalesOrderFormValues>;
    customers: SalesOrderFormProps['customers'];
    setOpenNewCustomer: Dispatch<SetStateAction<boolean>>;
    isOverLimit: boolean;
    watchCustomerId: string | undefined;
    loadingExposure: boolean;
    creditExposure: CreditExposure | null;
    isNearLimit: boolean;
    headroomAfterProposal: number | null;
    sourceLocationLabel: string;
    sourceLocationPlaceholder: string;
    sourceLocationDescription: string;
    isLocationRequired: boolean;
    selectableLocations: SalesOrderFormProps['locations'];
    lockedOrderType: SalesOrderFormProps['lockedOrderType'];
    mode: SalesOrderFormProps['mode'];
    selectedOrderType: SalesOrderType | undefined;
    documentIntent: SalesOrderFormProps['documentIntent'];
    salesTeam: { id: string; name: string }[];
};

export function OrderHeaderFields({
    form,
    customers,
    setOpenNewCustomer,
    isOverLimit,
    watchCustomerId,
    loadingExposure,
    creditExposure,
    isNearLimit,
    headroomAfterProposal,
    sourceLocationLabel,
    sourceLocationPlaceholder,
    sourceLocationDescription,
    isLocationRequired,
    selectableLocations,
    lockedOrderType,
    mode,
    selectedOrderType,
    documentIntent,
    salesTeam,
}: OrderHeaderFieldsProps) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField
                control={form.control}
                name="customerId"
                render={({ field }) => (
                    <FormItem className="flex flex-col">
                        <FormLabel>{salesLabels.customer}</FormLabel>
                        <FormControl>
                            <SalesOrderCustomerPicker
                                customers={customers}
                                value={field.value}
                                onChange={field.onChange}
                                onAddCustomer={() => setOpenNewCustomer(true)}
                                isOverLimit={isOverLimit}
                            />
                        </FormControl>
                        <FormDescription>
                            Wajib diisi untuk Sales Order customer.
                        </FormDescription>
                        <FormMessage />
                    </FormItem>
                )}
            />

            {/* Credit Exposure Banner */}
            {watchCustomerId && loadingExposure && (
                <div className="col-span-full flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Memeriksa limit kredit...
                </div>
            )}
            {creditExposure && !loadingExposure && (
                <div className="col-span-full">
                    <Alert
                        className={cn(
                            isOverLimit
                                ? 'border-red-300 bg-red-50 text-red-900'
                                : isNearLimit
                                  ? 'border-amber-300 bg-amber-50 text-amber-900'
                                  : 'border-green-300 bg-green-50 text-green-900',
                        )}
                    >
                        <Info className="h-4 w-4" />
                        <AlertTitle className="text-sm font-medium">
                            {isOverLimit
                                ? 'Batas kredit akan terlampaui'
                                : isNearLimit
                                  ? 'Kredit mendekati batas'
                                  : 'Informasi kredit'}
                        </AlertTitle>
                        <AlertDescription className="text-xs mt-1">
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                                <span>Limit:</span>
                                <span className="font-medium">
                                    {formatRupiah(creditExposure.creditLimit)}
                                </span>
                                <span>Piutang belum lunas:</span>
                                <span className="font-medium">
                                    {formatRupiah(
                                        creditExposure.unpaidInvoiceBalance,
                                    )}
                                </span>
                                <span>SO aktif tanpa invoice:</span>
                                <span className="font-medium">
                                    {formatRupiah(
                                        creditExposure.openOrderWithoutInvoice,
                                    )}
                                </span>
                                <span>Exposure saat ini:</span>
                                <span className="font-medium">
                                    {formatRupiah(
                                        creditExposure.currentExposure,
                                    )}
                                </span>
                                <span>Sisa headroom:</span>
                                <span
                                    className={cn(
                                        'font-medium',
                                        creditExposure.headroom <= 0 &&
                                            'text-red-600',
                                    )}
                                >
                                    {formatRupiah(creditExposure.headroom)}
                                </span>
                            </div>
                            {isOverLimit && (
                                <p className="mt-2 text-xs font-medium">
                                    Konfirmasi akan gagal — total melebihi limit
                                    kredit.
                                </p>
                            )}
                            {!isOverLimit &&
                                headroomAfterProposal !== null &&
                                headroomAfterProposal <
                                    creditExposure.creditLimit * 0.1 && (
                                    <p className="mt-2 text-xs">
                                        Akan melebihi jika confirm: sisa setelah
                                        proposal{' '}
                                        {formatRupiah(headroomAfterProposal)}
                                    </p>
                                )}
                        </AlertDescription>
                    </Alert>
                </div>
            )}

            {/* Source Location */}
            <FormField
                control={form.control}
                name="sourceLocationId"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>{sourceLocationLabel}</FormLabel>
                        <Select
                            onValueChange={(value) => {
                                // "none" sentinel means no location selected
                                field.onChange(
                                    value === '__none__' ? '' : value,
                                );
                            }}
                            value={field.value || '__none__'}
                        >
                            <FormControl>
                                <SelectTrigger className="w-full">
                                    <SelectValue
                                        placeholder={sourceLocationPlaceholder}
                                    />
                                </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                {!isLocationRequired && (
                                    <SelectItem value="__none__">
                                        <span className="text-muted-foreground italic">
                                            Semua gudang
                                        </span>
                                    </SelectItem>
                                )}
                                {selectableLocations.map((loc) => (
                                    <SelectItem key={loc.id} value={loc.id}>
                                        {loc.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <FormDescription>
                            {sourceLocationDescription}
                        </FormDescription>
                        <FormMessage />
                    </FormItem>
                )}
            />

            {/* Order Type */}
            <FormField
                control={form.control}
                name="orderType"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel className="flex items-center gap-1.5">
                            {salesLabels.orderType}
                            {!lockedOrderType && (
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <span
                                            aria-label="Penjelasan tipe pesanan"
                                            className="inline-flex cursor-help text-muted-foreground hover:text-foreground"
                                            tabIndex={0}
                                        >
                                            <Info className="h-3.5 w-3.5" />
                                        </span>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs text-left leading-relaxed">
                                        <p>
                                            {salesLabels.fulfillFromStock}:
                                            dipenuhi dari stok tersedia.
                                        </p>
                                        <p>
                                            {salesLabels.fulfillProduce}:
                                            produksi berdasarkan pesanan.
                                        </p>
                                        <p>
                                            {salesLabels.fulfillMaklon}: jasa
                                            berbasis bahan titipan customer;
                                            konsumsi bahan lewat Production
                                            Execution.
                                        </p>
                                    </TooltipContent>
                                </Tooltip>
                            )}
                        </FormLabel>
                        <Select
                            onValueChange={field.onChange}
                            defaultValue={
                                field.value ||
                                lockedOrderType ||
                                'MAKE_TO_STOCK'
                            }
                            disabled={!!lockedOrderType}
                        >
                            <FormControl>
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Pilih tipe order" />
                                </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                <SelectItem value="MAKE_TO_STOCK">
                                    {salesLabels.fulfillFromStock}
                                </SelectItem>
                                <SelectItem value="MAKE_TO_ORDER">
                                    {salesLabels.fulfillProduce}
                                </SelectItem>
                                <SelectItem value="MAKLON_JASA">
                                    {salesLabels.fulfillMaklon}
                                </SelectItem>
                            </SelectContent>
                        </Select>
                        <FormDescription>
                            {mode === 'edit'
                                ? salesLabels.orderTypeHelpLockedOnEdit
                                : lockedOrderType
                                  ? salesLabels.orderTypeHelpFromIntent
                                  : salesLabels.orderTypeHelpPick}
                        </FormDescription>
                        <FormMessage />
                    </FormItem>
                )}
            />

            {/* Order Date */}
            <FormField
                control={form.control}
                name="orderDate"
                render={({ field }) => (
                    <FormItem className="flex flex-col">
                        <FormLabel>{salesLabels.orderDate}</FormLabel>
                        <Popover>
                            <PopoverTrigger asChild>
                                <FormControl>
                                    <Button
                                        variant={'outline'}
                                        className={cn(
                                            'w-full pl-3 text-left font-normal',
                                            !field.value &&
                                                'text-muted-foreground',
                                        )}
                                    >
                                        {field.value ? (
                                            format(field.value, 'PPP')
                                        ) : (
                                            <span>Pilih tanggal</span>
                                        )}
                                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                    </Button>
                                </FormControl>
                            </PopoverTrigger>
                            <PopoverContent
                                className="w-auto p-0"
                                align="start"
                            >
                                <Calendar
                                    mode="single"
                                    selected={field.value}
                                    onSelect={field.onChange}
                                    disabled={(date) => {
                                        const maxDate = new Date();
                                        maxDate.setHours(23, 59, 59, 999);
                                        // Allow selection up to end of today, but maybe also allow some future dates if order can be backdated/postdated?
                                        // User mentioned they couldn't change month, which might be because they were trying to select a different month but arrows weren't working.
                                        // Let's allow a wider range for order date if needed, or just fix the UI.
                                        return (
                                            date < new Date('1900-01-01') ||
                                            date > maxDate
                                        );
                                    }}
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

            {/* Expected Date */}
            {selectedOrderType !== 'MAKE_TO_STOCK' && (
                <FormField
                    control={form.control}
                    name="expectedDate"
                    render={({ field }) => (
                        <FormItem className="flex flex-col">
                            <FormLabel>{salesLabels.expectedDate}</FormLabel>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <FormControl>
                                        <Button
                                            variant={'outline'}
                                            className={cn(
                                                'w-full pl-3 text-left font-normal',
                                                !field.value &&
                                                    'text-muted-foreground',
                                            )}
                                        >
                                            {field.value ? (
                                                format(field.value, 'PPP')
                                            ) : (
                                                <span>Pilih tanggal</span>
                                            )}
                                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                        </Button>
                                    </FormControl>
                                </PopoverTrigger>
                                <PopoverContent
                                    className="w-auto p-0"
                                    align="start"
                                >
                                    <Calendar
                                        mode="single"
                                        selected={field.value as Date} // Type assertion since expectedDate can be null
                                        onSelect={field.onChange}
                                        disabled={(date) =>
                                            date < new Date('1900-01-01')
                                        }
                                        captionLayout="dropdown"
                                        fromYear={2000}
                                        toYear={new Date().getFullYear() + 10}
                                        initialFocus
                                    />
                                </PopoverContent>
                            </Popover>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            )}

            {/* Notes */}
            <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>{formLabels.notes}</FormLabel>
                        <FormControl>
                            <Input
                                placeholder="Catatan opsional..."
                                {...field}
                                value={field.value || ''}
                            />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />

            {documentIntent === 'quotation' && (
                <FormField
                    control={form.control}
                    name="nextFollowUpDate"
                    render={({ field }) => (
                        <FormItem className="flex flex-col">
                            <FormLabel>Jadwal Follow-up</FormLabel>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <FormControl>
                                        <Button
                                            variant="outline"
                                            className={cn(
                                                'w-full pl-3 text-left font-normal',
                                                !field.value &&
                                                    'text-muted-foreground',
                                            )}
                                        >
                                            {field.value ? (
                                                format(
                                                    field.value as Date,
                                                    'PPP',
                                                )
                                            ) : (
                                                <span>
                                                    Pilih tanggal follow-up
                                                </span>
                                            )}
                                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                        </Button>
                                    </FormControl>
                                </PopoverTrigger>
                                <PopoverContent
                                    className="w-auto p-0"
                                    align="start"
                                >
                                    <Calendar
                                        mode="single"
                                        selected={field.value as Date}
                                        onSelect={field.onChange}
                                        disabled={(date) =>
                                            date < new Date('1900-01-01')
                                        }
                                        captionLayout="dropdown"
                                        fromYear={2000}
                                        toYear={new Date().getFullYear() + 5}
                                        initialFocus
                                    />
                                </PopoverContent>
                            </Popover>
                            <FormDescription>
                                Kapan harus hubungi customer lagi. Opsional.
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            )}

            {/* Sales Rep */}
            <FormField
                control={form.control}
                name="salesRepId"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Sales</FormLabel>
                        <Select
                            onValueChange={(value) =>
                                field.onChange(
                                    value === '__none__' ? null : value,
                                )
                            }
                            value={field.value ?? '__none__'}
                        >
                            <FormControl>
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Pilih sales" />
                                </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                <SelectItem value="__none__">
                                    <span className="text-muted-foreground italic">
                                        Tanpa sales
                                    </span>
                                </SelectItem>
                                {salesTeam.map((s) => (
                                    <SelectItem key={s.id} value={s.id}>
                                        {s.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <FormDescription>
                            Sales pemilik order. Kosongkan jika belum
                            ditentukan.
                        </FormDescription>
                        <FormMessage />
                    </FormItem>
                )}
            />
        </div>
    );
}
