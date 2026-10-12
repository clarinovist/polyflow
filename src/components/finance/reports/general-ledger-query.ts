import { parseBusinessDate } from '@/lib/utils/timezone';

export interface GeneralLedgerInitialQuery {
    accountId?: string;
    startDate?: string;
    toDate?: string;
    search?: string;
    mode?: 'lines' | 'expenses';
}

type QueryValue = string | string[] | undefined;

const ACCOUNT_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const SEARCH_PATTERN = /^[^\u0000-\u001F\u007F]{2,240}$/;

function oneSafeAccountId(value: QueryValue): string | undefined {
    return typeof value === 'string' && ACCOUNT_ID_PATTERN.test(value)
        ? value
        : undefined;
}

function oneValidDate(value: QueryValue): string | undefined {
    if (typeof value !== 'string') return undefined;
    try {
        return parseBusinessDate(value);
    } catch {
        return undefined;
    }
}

export function parseGeneralLedgerQuery(params: {
    account?: QueryValue;
    from?: QueryValue;
    to?: QueryValue;
    q?: QueryValue;
    mode?: QueryValue;
}): GeneralLedgerInitialQuery {
    const accountId = oneSafeAccountId(params.account);
    const startDate = oneValidDate(params.from);
    const toDate = oneValidDate(params.to);
    const search =
        typeof params.q === 'string' && SEARCH_PATTERN.test(params.q.trim())
            ? params.q.trim()
            : undefined;
    const mode =
        params.mode === 'expenses' || params.mode === 'lines'
            ? params.mode
            : undefined;
    return {
        ...(accountId ? { accountId } : {}),
        ...(startDate ? { startDate } : {}),
        ...(toDate ? { toDate } : {}),
        ...(search ? { search } : {}),
        ...(mode ? { mode } : {}),
    };
}

export function buildGeneralLedgerHref(
    accountId: string,
    toDate: string,
): string {
    const params = new URLSearchParams({ account: accountId, to: toDate });
    return `/finance/reports/general-ledger?${params.toString()}`;
}

export function buildGeneralLedgerSearchHref(input: {
    query: string;
    startDate: string;
    endDate: string;
    mode?: 'lines' | 'expenses';
}): string {
    const params = new URLSearchParams({
        q: input.query,
        from: input.startDate,
        to: input.endDate,
        ...(input.mode ? { mode: input.mode } : {}),
    });
    return `/finance/reports/general-ledger?${params.toString()}`;
}
