import { Prisma } from '@prisma/client';

/** Retry the entire transaction, never an individual statement after PG aborts it. */
export async function retryBarterWrite<T>(run: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
        try {
            return await run();
        } catch (error) {
            if (
                !(error instanceof Prisma.PrismaClientKnownRequestError) ||
                attempt >= 2
            )
                throw error;
            const target = Array.isArray(error.meta?.target)
                ? (error.meta.target as string[])
                : [];
            const retryable =
                error.code === 'P2034' ||
                (error.code === 'P2010' &&
                    ['40001', '40P01'].includes(String(error.meta?.code))) ||
                (error.code === 'P2002' &&
                    target.some((key) =>
                        [
                            'paymentNumber',
                            'settlementNumber',
                            'idempotencyKey',
                        ].includes(key),
                    ));
            if (!retryable) throw error;
        }
    }
}
