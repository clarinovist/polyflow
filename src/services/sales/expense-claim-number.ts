import { Prisma } from '@prisma/client';
import { toBusinessDateString } from '@/lib/utils/timezone';

const CLAIM_NUMBER_PREFIX = 'RMB';
const SEQUENCE_PAD_LENGTH = 3;
export const CLAIM_NUMBER_MAX_ATTEMPTS = 5;

type ClaimCounter = Pick<Prisma.TransactionClient, 'expenseClaim'>;

/** `RMB-YYYYMM-` using the WIB calendar month, not the server's UTC month. */
export function claimNumberPrefix(now: Date): string {
    const [year, month] = toBusinessDateString(now).split('-');
    return `${CLAIM_NUMBER_PREFIX}-${year}${month}-`;
}

export function formatClaimNumber(now: Date, sequence: number): string {
    return `${claimNumberPrefix(now)}${String(sequence).padStart(SEQUENCE_PAD_LENGTH, '0')}`;
}

/** Next number for the month. A concurrent duplicate is caught by the unique index and retried. */
export async function nextClaimNumber(
    db: ClaimCounter,
    now: Date,
): Promise<string> {
    const count = await db.expenseClaim.count({
        where: { claimNumber: { startsWith: claimNumberPrefix(now) } },
    });
    return formatClaimNumber(now, count + 1);
}

/** True for a P2002 whose violated target (array of fields or constraint name) mentions `field`. */
export function isUniqueViolationOn(error: unknown, field: string): boolean {
    if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
    ) {
        return false;
    }
    const target = error.meta?.target;
    const targets = Array.isArray(target)
        ? target.map(String)
        : typeof target === 'string'
          ? [target]
          : [];
    return targets.some((entry) => entry.includes(field));
}
