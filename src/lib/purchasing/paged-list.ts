import {
    getWibDayBounds,
    toBusinessDateString,
} from '@/lib/utils/timezone';

export const DEFAULT_PURCHASING_PAGE_SIZE = 50;
export const MAX_PURCHASING_PAGE_SIZE = 100;

export interface PurchasingPage<T> {
    items: T[];
    totalCount: number;
    page: number;
    pageSize: number;
    totalPages: number;
}

export type PurchasingSortDirection = 'asc' | 'desc';

export interface PurchasingPaginationInput {
    page?: number;
    pageSize?: number;
}

export function parsePurchasingSort<
    const TAllowedSorts extends readonly string[],
>(
    sort: string | undefined,
    direction: string | undefined,
    allowedSorts: TAllowedSorts,
    defaultSort: NoInfer<TAllowedSorts[number]>,
    defaultDirection: PurchasingSortDirection = 'desc',
): {
    sort: TAllowedSorts[number];
    direction: PurchasingSortDirection;
} {
    return {
        sort:
            sort && allowedSorts.includes(sort)
                ? (sort as TAllowedSorts[number])
                : defaultSort,
        direction:
            direction === 'asc' || direction === 'desc'
                ? direction
                : defaultDirection,
    };
}

function normalizePositiveInteger(value: number | undefined, fallback: number) {
    return value !== undefined && Number.isSafeInteger(value) && value > 0
        ? value
        : fallback;
}

export function parsePurchasingPageParam(value: string | undefined) {
    if (!value || !/^\d+$/.test(value)) return undefined;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function parsePurchasingDateBounds(
    startDate: string | undefined,
    endDate: string | undefined,
): { startDate?: Date; endDate?: Date } {
    const bounds: { startDate?: Date; endDate?: Date } = {};

    try {
        if (startDate) {
            bounds.startDate = getWibDayBounds(startDate).startOfDay;
        }
    } catch {
        // Invalid URL filters are ignored rather than reaching Prisma as invalid dates.
    }

    try {
        if (endDate) {
            bounds.endDate = getWibDayBounds(endDate).endOfDay;
        }
    } catch {
        // Invalid URL filters are ignored rather than reaching Prisma as invalid dates.
    }

    return bounds;
}

export function getWibBusinessDayStart(now: Date = new Date()): Date {
    return getWibDayBounds(toBusinessDateString(now)).startOfDay;
}

export function normalizePurchasingPagination(
    input: PurchasingPaginationInput = {},
) {
    const requestedPageSize = normalizePositiveInteger(
        input.pageSize,
        DEFAULT_PURCHASING_PAGE_SIZE,
    );
    const pageSize = Math.min(requestedPageSize, MAX_PURCHASING_PAGE_SIZE);
    const requestedPage = normalizePositiveInteger(input.page, 1);
    const maxPage = Math.floor(2_147_483_647 / pageSize) + 1;
    const page = Math.min(requestedPage, maxPage);

    return {
        page,
        pageSize,
        skip: (page - 1) * pageSize,
    };
}

export function clampPurchasingPage(
    requestedPage: number,
    totalCount: number,
    pageSize: number,
) {
    const totalPages = Math.ceil(totalCount / pageSize);
    return Math.min(requestedPage, Math.max(totalPages, 1));
}

export function createPurchasingPage<T>(
    items: T[],
    totalCount: number,
    page: number,
    pageSize: number,
): PurchasingPage<T> {
    return {
        items,
        totalCount,
        page,
        pageSize,
        totalPages: Math.ceil(totalCount / pageSize),
    };
}
