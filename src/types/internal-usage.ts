import type { Unit } from '@prisma/client';

export type InternalUsageRecord = {
    id: string;
    number: string;
    productName: string;
    skuCode: string;
    unit: Unit;
    locationName: string;
    recipient: string;
    department: string;
    purpose: string;
    recordedByName: string;
    createdAt: string;
    quantity: number;
    stockBefore: number;
    stockAfter: number;
    movementId: string;
};

export type InternalUsageFormData = {
    date: string;
    actorName: string;
    products: {
        id: string;
        name: string;
        skuCode: string;
        unit: Unit;
        stocks: {
            locationId: string;
            locationName: string;
            quantity: number;
            reserved: number;
            available: number;
        }[];
    }[];
};

export type InternalUsageHistory = {
    records: InternalUsageRecord[];
    total: number;
    page: number;
    pageSize: number;
    query: string;
    department: string;
    departments: string[];
};

export type InternalUsageAccountRef = { code: string; name: string };

/** Read-only preflight result; `accounting` is only returned to Finance/Admin. */
export type InternalUsageReadiness = {
    ready: boolean;
    code?: string;
    message: string;
    accounting?: {
        amount?: number;
        inventoryAccount?: InternalUsageAccountRef;
        expenseAccount?: InternalUsageAccountRef;
        glBalance?: number;
        basis: (InternalUsageAccountRef & { value: number })[];
    };
};
