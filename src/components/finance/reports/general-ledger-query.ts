import { parseBusinessDate } from '@/lib/utils/timezone';

export interface GeneralLedgerInitialQuery {
    accountId?: string;
    toDate?: string;
}

type QueryValue = string | string[] | undefined;

const ACCOUNT_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

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
    to?: QueryValue;
}): GeneralLedgerInitialQuery {
    const accountId = oneSafeAccountId(params.account);
    const toDate = oneValidDate(params.to);
    return {
        ...(accountId ? { accountId } : {}),
        ...(toDate ? { toDate } : {}),
    };
}

export function buildGeneralLedgerHref(
    accountId: string,
    toDate: string,
): string {
    const params = new URLSearchParams({ account: accountId, to: toDate });
    return `/finance/reports/general-ledger?${params.toString()}`;
}
