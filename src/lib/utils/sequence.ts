import { Prisma } from '@prisma/client';

import { prisma } from '../core/prisma';

const PAYMENT_NUMBER_MAX_ATTEMPTS = 3;

function isPaymentNumberConflict(error: unknown): boolean {
    return (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        Array.isArray(error.meta?.target) &&
        (error.meta?.target as string[]).includes('paymentNumber')
    );
}

/**
 * Jalankan `run` (yang tiap attempt mengalokasikan nomor baru via
 * getNextSequence lalu create Payment) dengan retry khusus P2002 pada
 * `paymentNumber`. Menutup kasus counter tertinggal (backfill SQL yang tidak
 * menaikkan SystemSequence, insiden 2026-09-01/02) tanpa bikin user gagal:
 * tiap retry memakai nomor berikutnya. Error lain langsung dilempar.
 * Pola sama dengan createInvoiceWithNumberRetry (invoice-lifecycle-service).
 */
export async function retryOnPaymentNumberConflict<T>(
    run: () => Promise<T>,
): Promise<T> {
    let lastError: unknown;
    for (
        let attempt = 0;
        attempt < PAYMENT_NUMBER_MAX_ATTEMPTS;
        attempt++
    ) {
        try {
            return await run();
        } catch (error) {
            lastError = error;
            if (!isPaymentNumberConflict(error)) throw error;
        }
    }
    throw lastError;
}

/**
 * Get next sequence number for a given key (e.g. 'PAYMENT_IN', 'PAYMENT_OUT').
 *
 * Atomic: satu statement `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` —
 * row value di-increment oleh Postgres, bukan di JavaScript, sehingga dua
 * request bersamaan tidak mungkin mendapat nomor yang sama (versi lama
 * baca → +1 di JS → update punya race window; insiden P2002 2026-09-01/02
 * dipicu counter tertinggal oleh backfill SQL, bukan race ini, tapi keduanya
 * menghasilkan gejala duplikat yang sama).
 *
 * @returns Formatted sequence number (e.g., 'PAY-IN-00001')
 */
export async function getNextSequence(key: string): Promise<string> {
    // Upsert menutup dua kasus sekaligus: row belum ada (INSERT value=1) dan
    // row sudah ada (UPDATE value = value + 1). RETURNING mengambil nilai
    // yang benar-benar ditulis dalam lock yang sama, tanpa jendela race.
    const result = await prisma.$queryRaw<Array<{ value: bigint }>>`
        INSERT INTO "SystemSequence" ("key", "value")
        VALUES (${key}, 1)
        ON CONFLICT ("key")
        DO UPDATE SET "value" = "SystemSequence"."value" + 1
        RETURNING "value"`;

    const value = result[0]?.value;
    if (value === undefined) {
        throw new Error(
            `getNextSequence: INSERT ... RETURNING tidak mengembalikan baris untuk key=${key}`,
        );
    }

    const paddedNumber = value.toString().padStart(5, '0');

    switch (key) {
        case 'PAYMENT_IN':
            return `PAY-IN-${paddedNumber}`;
        case 'PAYMENT_OUT':
            return `PAY-OUT-${paddedNumber}`;
        default:
            return `${key}-${paddedNumber}`;
    }
}
