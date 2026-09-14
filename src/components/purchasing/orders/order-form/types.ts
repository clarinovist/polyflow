import type { ComponentProps, Dispatch, SetStateAction } from 'react';
import type {
    FieldArrayWithId,
    UseFieldArrayRemove,
    UseFormReturn,
} from 'react-hook-form';
import type { useRouter } from 'next/navigation';
import type { CreatePurchaseOrderValues } from '@/lib/schemas/purchasing';
import type { PpnCalculation } from '@/lib/utils/ppn';
import type { PurchaseOrderForm } from '../PurchaseOrderForm';

// Render-only contracts; parent owns RHF, state, effects and all calculations.
type FormProps = ComponentProps<typeof PurchaseOrderForm>;
type FormValues = CreatePurchaseOrderValues & { id?: string };
type FormApi = UseFormReturn<FormValues>;
type ItemField = FieldArrayWithId<FormValues, 'items'>;
type ProductVariant = FormProps['productVariants'][number];
type InputMap = Record<number, string>;
type TaxableMap = Record<number, boolean>;

export interface PurchaseOrderTaxProps {
    form: FormApi;
    index: number;
    taxableItems: TaxableMap;
    setTaxableItems: Dispatch<SetStateAction<TaxableMap>>;
    ppnResult: PpnCalculation;
}

export interface PurchaseOrderItemViewProps extends PurchaseOrderTaxProps {
    field: ItemField;
    fields: ItemField[];
    productVariants: ProductVariant[];
    router: ReturnType<typeof useRouter>;
    handleProductChange: (index: number, variantId: string) => void;
    rawQtyInputs: InputMap;
    setRawQtyInputs: Dispatch<SetStateAction<InputMap>>;
    rawPriceInputs: InputMap;
    setRawPriceInputs: Dispatch<SetStateAction<InputMap>>;
    remove: UseFieldArrayRemove;
    discountAmount: number;
    lineTotal: number;
}

export interface PurchaseOrderDesktopItemProps extends PurchaseOrderItemViewProps {
    selectedVariant: ProductVariant | undefined;
}

export interface PurchaseOrderMetadataProps {
    form: FormApi;
    suppliers: FormProps['suppliers'];
    selectedSupplier: FormProps['suppliers'][number] | undefined;
}

export interface PurchaseOrderSummaryProps extends PurchaseOrderMetadataProps {
    totals: {
        gross: number;
        discount: number;
        tax: number;
        dpp: number;
        net: number;
        hasInclude: boolean;
    };
    grandTotal: number;
    isLoading: boolean;
    mode: 'create' | 'edit';
}
