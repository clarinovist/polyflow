import { Prisma } from '@prisma/client';

import { getTenantDbFromContext, prisma } from '../core/prisma';

/** Klien minimal yang dibutuhkan: cukup bisa menjalankan $queryRaw. */
type SequenceClient = Pick<typeof prisma, '$queryRaw'>;

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
 *
 * PENTING — alokasi nomor harus di LUAR transaksi yang di-retry.
 * getNextSequence memakai klien tenant dari AsyncLocalStorage (bukan `tx`),
 * sehingga increment counter tetap commit walau transaksi pemanggil rollback.
 * Kalau alokasi dipindahkan ke dalam `tx`, rollback ikut membatalkan
 * increment dan setiap retry akan meminta nomor yang SAMA — retry berubah
 * jadi loop tak berguna. Jangan "rapikan" dengan meneruskan `tx` ke
 * getNextSequence.
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
export async function getNextSequence(
    key: string,
    client?: SequenceClient,
): Promise<string> {
    // Klien tenant WAJIB di-resolve eksplisit dari AsyncLocalStorage.
    //
    // `prisma` yang di-import adalah Proxy (core/prisma.ts) yang me-route ke
    // DB tenant HANYA bila berjalan di dalam tenantContext.run(); di luar itu
    // ia jatuh ke Main/ref DB. Alokasi nomor lewat proxy karena itu bisa
    // membaca counter DB REF sementara `tx.payment.create` menulis ke DB
    // TENANT — nomor diambil dari counter yang salah.
    //
    // Insiden produksi 2026-09-02: counter ref DB (0 Payment, tertinggal di
    // 59) mengeluarkan PAY-IN-00059..63 untuk tenant yang MAX-nya sudah 96 →
    // P2002 beruntun dan 3 attempt retry habis tanpa pernah bisa berhasil,
    // karena sumber nomornya memang salah, bukan karena bentrok sesaat.
    // Bug ini lama tersembunyi di balik kegagalan 23502 yang terjadi lebih
    // dulu; begitu 23502 diperbaiki, jalur ini baru sampai ke INSERT.
    //
    // Argumen `client` disediakan untuk pemanggil yang sudah memegang klien
    // tenant (mis. service dengan `tx`). CATATAN: jangan berikan klien
    // transaksi bila pemanggil memakai retryOnPaymentNumberConflict — lihat
    // catatan di fungsi tersebut.
    const db = client ?? getTenantDbFromContext() ?? prisma;

    // Upsert menutup dua kasus sekaligus: row belum ada (INSERT value=1) dan
    // row sudah ada (UPDATE value = value + 1). RETURNING mengambil nilai
    // yang benar-benar ditulis dalam lock yang sama, tanpa jendela race.
    //
    // "id" dan "updatedAt" WAJIB diisi eksplisit: `@default(uuid())` dan
    // `@updatedAt` di schema.prisma adalah default sisi CLIENT Prisma, bukan
    // default sisi database (information_schema: column_default kosong, NOT
    // NULL). Raw SQL menyalip ORM, jadi tanpa kedua kolom ini Postgres menolak
    // dengan 23502 — dan karena NOT NULL dievaluasi pada proposed row SEBELUM
    // konflik terdeteksi, jalur DO UPDATE ikut gagal (100% gagal, bukan
    // intermiten). Regresi produksi 2026-09-02, plan:
    // docs/plan/2026-09-02-fix-systemsequence-null-id.md
    const result = await db.$queryRaw<Array<{ value: bigint }>>`
        INSERT INTO "SystemSequence" ("id", "key", "value", "updatedAt")
        VALUES (gen_random_uuid()::text, ${key}, 1, NOW())
        ON CONFLICT ("key")
        DO UPDATE SET "value" = "SystemSequence"."value" + 1, "updatedAt" = NOW()
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
