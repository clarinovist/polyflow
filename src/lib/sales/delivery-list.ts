import { DeliveryStatus } from '@prisma/client';
import { endOfDay, endOfMonth, startOfDay, startOfMonth } from 'date-fns';
import {
    parseTablePage,
    parseTablePageSize,
    parseTableSortDirection,
    parseTableSortKey,
    type TableSortDirection,
} from '@/lib/ui/table-query';

export const DELIVERY_WORKFLOW_GROUPS = {
    needs_action: [DeliveryStatus.PENDING, DeliveryStatus.LOADING],
    in_transit: [
        DeliveryStatus.SHIPPED,
        DeliveryStatus.IN_TRANSIT,
        DeliveryStatus.ARRIVED,
    ],
    completed: [DeliveryStatus.DELIVERED],
    exceptions: [DeliveryStatus.RETURNED, DeliveryStatus.CANCELLED],
} as const;
export type DeliveryWorkflowGroup = keyof typeof DELIVERY_WORKFLOW_GROUPS;
export const DELIVERY_LIST_SORTS = [
    'priority',
    'deliveryDate',
    'orderNumber',
] as const;
export type DeliveryListSort = (typeof DELIVERY_LIST_SORTS)[number];
export interface DeliveryListQuery {
    startDate: Date;
    endDate: Date;
    search?: string;
    workflowGroup?: DeliveryWorkflowGroup;
    status?: DeliveryStatus;
    customerId?: string;
    sourceLocationId?: string;
    page: number;
    pageSize: number;
    sort: DeliveryListSort;
    direction: TableSortDirection;
}
export type DeliveryListSearchParams = Record<
    string,
    string | string[] | undefined
>;
const OWNED_KEYS = [
    'startDate',
    'endDate',
    'q',
    'group',
    'status',
    'customer',
    'location',
    'page',
    'pageSize',
    'sort',
    'direction',
] as const;
function scalar(value: string | string[] | undefined) {
    return typeof value === 'string' ? value : undefined;
}
function bounded(value: string | undefined, max = 100) {
    const normalized = value?.trim();
    return normalized ? normalized.slice(0, max) : undefined;
}
function parseDateBoundary(
    value: string | undefined,
    boundary: 'start' | 'end',
) {
    if (!value) return undefined;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return undefined;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return parsed;
    return boundary === 'start' ? startOfDay(parsed) : endOfDay(parsed);
}
export function parseDeliveryListSearchParams(
    params: DeliveryListSearchParams,
    now = new Date(),
): {
    query: DeliveryListQuery;
    canonical: URLSearchParams;
    needsRedirect: boolean;
} {
    const rawStart = scalar(params.startDate),
        rawEnd = scalar(params.endDate);
    const parsedStart = parseDateBoundary(rawStart, 'start'),
        parsedEnd = parseDateBoundary(rawEnd, 'end');
    const validRange = Boolean(
        parsedStart && parsedEnd && parsedStart <= parsedEnd,
    );
    const startDate = validRange ? parsedStart! : startOfMonth(now);
    const endDate = validRange ? parsedEnd! : endOfMonth(now);
    const search = bounded(scalar(params.q));
    const rawGroup = scalar(params.group);
    const workflowGroup =
        rawGroup && rawGroup in DELIVERY_WORKFLOW_GROUPS
            ? (rawGroup as DeliveryWorkflowGroup)
            : undefined;
    const rawStatus = scalar(params.status);
    const status =
        !workflowGroup &&
        rawStatus &&
        Object.values(DeliveryStatus).includes(rawStatus as DeliveryStatus)
            ? (rawStatus as DeliveryStatus)
            : undefined;
    const customerId = bounded(scalar(params.customer), 120);
    const sourceLocationId = bounded(scalar(params.location), 120);
    const page = parseTablePage(scalar(params.page));
    const pageSize = parseTablePageSize(scalar(params.pageSize));
    const sort = parseTableSortKey(
        scalar(params.sort),
        DELIVERY_LIST_SORTS,
        'priority',
    );
    const direction = parseTableSortDirection(scalar(params.direction), 'desc');
    const canonical = new URLSearchParams();
    if (validRange) {
        canonical.set('startDate', rawStart!);
        canonical.set('endDate', rawEnd!);
    }
    if (search) canonical.set('q', search);
    if (workflowGroup) canonical.set('group', workflowGroup);
    else if (status) canonical.set('status', status);
    if (customerId) canonical.set('customer', customerId);
    if (sourceLocationId) canonical.set('location', sourceLocationId);
    if (page !== 1) canonical.set('page', String(page));
    if (pageSize !== 50) canonical.set('pageSize', String(pageSize));
    if (sort !== 'priority') canonical.set('sort', sort);
    if (direction !== 'desc') canonical.set('direction', direction);
    const original = new URLSearchParams();
    for (const key of OWNED_KEYS) {
        const value = scalar(params[key]);
        if (value !== undefined) original.set(key, value);
    }
    const unknown = Object.keys(params).some(
        (key) => !OWNED_KEYS.includes(key as (typeof OWNED_KEYS)[number]),
    );
    return {
        query: {
            startDate,
            endDate,
            search,
            workflowGroup,
            status,
            customerId,
            sourceLocationId,
            page,
            pageSize,
            sort,
            direction,
        },
        canonical,
        needsRedirect: unknown || original.toString() !== canonical.toString(),
    };
}
export function setDeliveryListParams(
    current: URLSearchParams,
    updates: Record<string, string | undefined>,
    resetPage = true,
) {
    const next = new URLSearchParams(current.toString());
    for (const [key, value] of Object.entries(updates)) {
        if (value) next.set(key, value);
        else next.delete(key);
    }
    if (resetPage) next.delete('page');
    return next;
}
