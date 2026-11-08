export type FindingLinkSource = {
    entityType: string | null;
    entityId: string | null;
    detector: string;
    fingerprint: string;
};

const DETAIL_PAGES: Readonly<Record<string, string>> = {
    Invoice: '/finance/invoices/sales',
    PurchaseInvoice: '/finance/invoices/purchase',
    SalesOrder: '/sales/orders',
    ProductionOrder: '/production/orders',
    // The inventory ledger page is keyed by variant id.
    ProductVariant: '/warehouse/inventory',
};

// Entities without a detail page link to the list that holds them.
function listPageFor(source: FindingLinkSource): string | null {
    if (source.entityType === 'BarterSettlement') return '/finance/journals';
    if (source.entityType !== 'Payment') return null;
    if (source.fingerprint.includes(':SALES_PAYMENT:')) {
        return '/finance/payments/received';
    }
    if (source.fingerprint.includes(':PURCHASE_PAYMENT:')) {
        return '/finance/payments/sent';
    }
    return null;
}

/** App page for the entity behind a finding, or null when there is none. */
export function findingEntityHref(source: FindingLinkSource): string | null {
    const listPage = listPageFor(source);
    if (listPage) return listPage;

    const base = source.entityType ? DETAIL_PAGES[source.entityType] : undefined;
    if (!base || !source.entityId) return null;
    return `${base}/${encodeURIComponent(source.entityId)}`;
}
