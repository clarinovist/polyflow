interface DeliveryOrderVehicle {
    plateNumber: string;
    name: string;
    ownershipType: string;
    driverName?: string | null;
}

interface DeliveryOrderItemData {
    id: string;
    quantity?: number | string;
    enteredQuantity?: number | string | null;
    enteredUnit?: string | null;
    conversionFactorSnapshot?: number | string | null;
    verifiedQuantity?: number | string | null;
    notes?: string | null;
    productVariantId?: string;
    productVariant?: {
        name?: string;
        skuCode?: string;
        primaryUnit?: string | null;
        product?: { name?: string };
        [key: string]: unknown;
    } | null;
    [key: string]: unknown;
}

export interface DeliveryOrderDetailData {
    id: string;
    orderNumber: string;
    salesOrderId: string;
    status: string;
    deliveryDate: string | Date;
    carrier?: string | null;
    trackingNumber?: string | null;
    notes?: string | null;
    destinationAddress?: string | null;
    vehiclePhotoUrl?: string | null;
    proofOfDeliveryUrl?: string | null;
    proofOfDeliveryAt?: string | Date | null;
    receivedBy?: string | null;
    loadVerifiedAt?: string | Date | null;
    loadVerifiedById?: string | null;
    loadingStartedAt?: string | Date | null;
    estimatedWeightKg?: number | null;
    appliedRateType?: string | null;
    appliedRouteName?: string | null;
    appliedCostRate?: number | null;
    appliedChargeRate?: number | null;
    totalCost?: number | null;
    totalCharge?: number | null;
    vehicle?: DeliveryOrderVehicle | null;
    salesOrder?: {
        orderNumber?: string;
        customerId?: string | null;
        customer?: {
            id?: string;
            name?: string;
            shippingAddress?: string | null;
            billingAddress?: string | null;
        } | null;
        /** Used to offer the combined "SJ + Invoice" ESC/P download, and to
         * hide "Batalkan Pengiriman" once any invoice is PAID/PARTIAL. */
        invoices?: { id: string; invoiceNumber: string; status?: string }[];
    } | null;
    sourceLocation?: { name?: string } | null;
    createdBy?: { name?: string } | null;
    items: DeliveryOrderItemData[];
}
