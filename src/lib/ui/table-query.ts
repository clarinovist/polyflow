export const DEFAULT_TABLE_PAGE_SIZE = 50;
export const MAX_TABLE_PAGE_SIZE = 100;

export type TableSortDirection = 'asc' | 'desc';

interface PageSizeOptions {
    defaultPageSize?: number;
    maxPageSize?: number;
}

function parsePositiveInteger(value: unknown) {
    if (typeof value === 'number') {
        return Number.isSafeInteger(value) && value > 0 ? value : undefined;
    }

    if (typeof value !== 'string' || !/^\d+$/.test(value)) {
        return undefined;
    }

    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function parseTablePage(value: unknown) {
    return parsePositiveInteger(value) ?? 1;
}

export function parseTablePageSize(
    value: unknown,
    {
        defaultPageSize = DEFAULT_TABLE_PAGE_SIZE,
        maxPageSize = MAX_TABLE_PAGE_SIZE,
    }: PageSizeOptions = {},
) {
    const safeMaximum =
        parsePositiveInteger(maxPageSize) ?? MAX_TABLE_PAGE_SIZE;
    const configuredDefault =
        parsePositiveInteger(defaultPageSize) ?? DEFAULT_TABLE_PAGE_SIZE;
    const safeDefault = Math.min(configuredDefault, safeMaximum);
    const parsed = parsePositiveInteger(value);

    return parsed === undefined ? safeDefault : Math.min(parsed, safeMaximum);
}

export function parseTableSortDirection(
    value: unknown,
    fallback: TableSortDirection = 'asc',
): TableSortDirection {
    return value === 'asc' || value === 'desc' ? value : fallback;
}

export function parseTableSortKey<
    const TAllowedSortKeys extends readonly string[],
>(
    value: unknown,
    allowedSortKeys: TAllowedSortKeys,
    fallback: NoInfer<TAllowedSortKeys[number]>,
): TAllowedSortKeys[number] {
    return typeof value === 'string' && allowedSortKeys.includes(value)
        ? (value as TAllowedSortKeys[number])
        : fallback;
}
