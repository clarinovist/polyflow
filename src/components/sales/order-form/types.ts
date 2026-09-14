import type { SalesOrderType, Unit } from '@prisma/client';

// Form-only shape shared with render leaves; the public parent props stay unchanged.
export type SalesOrderFormValues = {
    id?: string;
    customerId?: string;
    salesRepId?: string | null;
    sourceLocationId: string;
    orderDate: Date;
    expectedDate?: Date | null;
    orderType?: SalesOrderType; // Optional in form state logic, handled by schema defaults
    notes?: string;
    shippingCost?: number;
    nextFollowUpDate?: Date | null;
    items: {
        id?: string;
        productVariantId: string;
        quantity: number;
        unitPrice: number;
        enteredQuantity?: number;
        enteredUnit?: Unit;
        conversionFactorSnapshot?: number;
        enteredUnitPrice?: number;
        discountPercent?: number;
        taxPercent?: number;
        dppOtherAmount?: number | null;
        ppnMode?: 'INCLUDE' | 'EXCLUDE';
        isFreeItem?: boolean;
    }[];
    customItems?: {
        tempId: string;
        name: string;
        sellPrice: number;
    }[];
};
