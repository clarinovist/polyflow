import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Prisma } from '@prisma/client';

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        $queryRaw: vi.fn(),
    },
    getTenantDbFromContext: vi.fn(),
}));

import { getNextSequence, retryOnPaymentNumberConflict } from '../sequence';
import { getTenantDbFromContext, prisma } from '@/lib/core/prisma';

const queryRawMock = vi.mocked(prisma.$queryRaw);
const getTenantDbMock = vi.mocked(getTenantDbFromContext);

function conflictError(): Prisma.PrismaClientKnownRequestError {
    return new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`paymentNumber`)',
        {
            code: 'P2002',
            clientVersion: 'test',
            meta: { target: ['paymentNumber'] },
        },
    );
}

describe('getNextSequence', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('mengembalikan value dari upsert RETURNING dengan format PAYMENT_IN', async () => {
        queryRawMock.mockResolvedValue([{ value: BigInt(97) }]);

        const result = await getNextSequence('PAYMENT_IN');

        expect(result).toBe('PAY-IN-00097');
        expect(queryRawMock).toHaveBeenCalledTimes(1);
    });

    it('mengembalikan format PAYMENT_OUT', async () => {
        queryRawMock.mockResolvedValue([{ value: BigInt(171) }]);

        expect(await getNextSequence('PAYMENT_OUT')).toBe('PAY-OUT-00171');
    });

    it('mengembalikan format default untuk key lain', async () => {
        queryRawMock.mockResolvedValue([{ value: BigInt(7) }]);

        expect(await getNextSequence('INVOICE_X')).toBe('INVOICE_X-00007');
    });

    it('pad 5 digit untuk value kecil', async () => {
        queryRawMock.mockResolvedValue([{ value: BigInt(1) }]);

        expect(await getNextSequence('PAYMENT_IN')).toBe('PAY-IN-00001');
    });

    it('throw bila RETURNING tidak menghasilkan baris', async () => {
        queryRawMock.mockResolvedValue([]);

        await expect(getNextSequence('PAYMENT_IN')).rejects.toThrow(
            /RETURNING tidak mengembalikan baris/,
        );
    });

    it('throw bila baris RETURNING tanpa field value', async () => {
        queryRawMock.mockResolvedValue([{} as { value: bigint }]);

        await expect(getNextSequence('PAYMENT_IN')).rejects.toThrow(
            /RETURNING tidak mengembalikan baris/,
        );
    });
});

/**
 * Regresi 2026-09-02: raw SQL menyalip Prisma ORM, jadi `@default(uuid())` dan
 * `@updatedAt` (default sisi CLIENT, bukan sisi database) tidak terisi —
 * Postgres menolak dengan 23502 `null value in column "id"`. Karena
 * `$queryRaw` di-mock penuh, assertion terhadap HASIL tidak pernah bisa
 * menangkap SQL yang salah; satu-satunya lapis yang menangkap kelas bug ini
 * tanpa database nyata adalah assertion terhadap BENTUK SQL.
 *
 * Postgres mengevaluasi NOT NULL pada proposed row SEBELUM mendeteksi konflik,
 * sehingga kolom yang hilang membuat jalur DO UPDATE ikut gagal — 100% gagal,
 * bukan intermiten.
 */
describe('getNextSequence — bentuk SQL (anti-regresi 23502)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        queryRawMock.mockResolvedValue([{ value: BigInt(1) }]);
    });

    async function capturedSql(): Promise<string> {
        await getNextSequence('PAYMENT_IN');
        const strings = queryRawMock.mock.calls[0]?.[0] as
            | TemplateStringsArray
            | undefined;
        if (!strings) throw new Error('$queryRaw tidak dipanggil');
        return Array.from(strings).join(' ? ');
    }

    it('dipanggil sebagai tagged template (bukan string mentah)', async () => {
        await getNextSequence('PAYMENT_IN');
        const first = queryRawMock.mock.calls[0]?.[0];

        expect(Array.isArray(first)).toBe(true);
    });

    it('menyertakan kolom "id" pada daftar INSERT', async () => {
        expect(await capturedSql()).toMatch(/INSERT INTO\s+"SystemSequence"[^)]*"id"/);
    });

    it('menyertakan kolom "updatedAt" pada daftar INSERT', async () => {
        expect(await capturedSql()).toMatch(
            /INSERT INTO\s+"SystemSequence"[^)]*"updatedAt"/,
        );
    });

    it('mengisi "id" dengan gen_random_uuid() bertipe text', async () => {
        expect(await capturedSql()).toMatch(/gen_random_uuid\(\)::text/);
    });

    it('menyetel "updatedAt" juga di jalur DO UPDATE', async () => {
        const sql = await capturedSql();
        const doUpdate = sql.slice(sql.indexOf('DO UPDATE'));

        expect(doUpdate).toMatch(/"updatedAt"\s*=\s*NOW\(\)/);
    });

    it('tetap increment nilai di Postgres, bukan di JavaScript', async () => {
        expect(await capturedSql()).toMatch(
            /"value"\s*=\s*"SystemSequence"\."value"\s*\+\s*1/,
        );
    });

    it('tetap memakai ON CONFLICT ("key") + RETURNING "value"', async () => {
        const sql = await capturedSql();

        expect(sql).toMatch(/ON CONFLICT\s*\(\s*"key"\s*\)/);
        expect(sql).toMatch(/RETURNING\s+"value"/);
    });
});

/**
 * Insiden produksi 2026-09-02 (kedua): `prisma` yang di-import adalah Proxy
 * yang me-route ke DB tenant HANYA di dalam tenantContext.run(); di luar itu
 * jatuh ke Main/ref DB. Akibatnya nomor dialokasikan dari counter ref DB
 * (tertinggal di 59, 0 Payment) sementara payment.create menulis ke DB tenant
 * (MAX sudah 96) → P2002 beruntun PAY-IN-00059..63 yang tidak mungkin sembuh
 * lewat retry, karena sumber nomornya memang salah.
 */
describe('getNextSequence — routing klien tenant', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('memakai klien tenant dari context, BUKAN proxy prisma', async () => {
        const tenantQueryRaw = vi.fn().mockResolvedValue([{ value: BigInt(97) }]);
        getTenantDbMock.mockReturnValue({
            $queryRaw: tenantQueryRaw,
        } as unknown as ReturnType<typeof getTenantDbFromContext>);

        const result = await getNextSequence('PAYMENT_IN');

        expect(result).toBe('PAY-IN-00097');
        expect(tenantQueryRaw).toHaveBeenCalledTimes(1);
        // Kunci regresi: proxy global tidak boleh tersentuh sama sekali.
        expect(queryRawMock).not.toHaveBeenCalled();
    });

    it('memakai klien eksplisit bila diberikan, mengalahkan context', async () => {
        const explicitQueryRaw = vi
            .fn()
            .mockResolvedValue([{ value: BigInt(5) }]);
        const contextQueryRaw = vi.fn();
        getTenantDbMock.mockReturnValue({
            $queryRaw: contextQueryRaw,
        } as unknown as ReturnType<typeof getTenantDbFromContext>);

        const result = await getNextSequence('PAYMENT_OUT', {
            $queryRaw: explicitQueryRaw,
        } as unknown as Parameters<typeof getNextSequence>[1]);

        expect(result).toBe('PAY-OUT-00005');
        expect(explicitQueryRaw).toHaveBeenCalledTimes(1);
        expect(contextQueryRaw).not.toHaveBeenCalled();
        expect(queryRawMock).not.toHaveBeenCalled();
    });

    it('fallback ke proxy prisma hanya bila tidak ada context tenant', async () => {
        getTenantDbMock.mockReturnValue(undefined);
        queryRawMock.mockResolvedValue([{ value: BigInt(3) }]);

        const result = await getNextSequence('PAYMENT_IN');

        expect(result).toBe('PAY-IN-00003');
        expect(queryRawMock).toHaveBeenCalledTimes(1);
    });
});

describe('retryOnPaymentNumberConflict', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('langsung sukses tanpa retry bila run berhasil di attempt pertama', async () => {
        const run = vi.fn().mockResolvedValue('ok');

        await expect(retryOnPaymentNumberConflict(run)).resolves.toBe('ok');
        expect(run).toHaveBeenCalledTimes(1);
    });

    it('retry bila P2002 target paymentNumber dan sukses di attempt berikutnya', async () => {
        const run = vi
            .fn()
            .mockRejectedValueOnce(conflictError())
            .mockResolvedValueOnce('ok');

        await expect(retryOnPaymentNumberConflict(run)).resolves.toBe('ok');
        expect(run).toHaveBeenCalledTimes(2);
    });

    it('habis 3 attempt lalu lempar P2002 terakhir', async () => {
        const run = vi.fn().mockRejectedValue(conflictError());

        await expect(retryOnPaymentNumberConflict(run)).rejects.toThrow(
            /paymentNumber/,
        );
        expect(run).toHaveBeenCalledTimes(3);
    });

    it('tidak retry bila P2002 target bukan paymentNumber', async () => {
        const other = new Prisma.PrismaClientKnownRequestError('dup', {
            code: 'P2002',
            clientVersion: 'test',
        });
        // Simulasi meta target berbeda (mis. id) — constructor tanpa meta.
        Object.defineProperty(other, 'meta', { value: { target: ['id'] } });
        const run = vi.fn().mockRejectedValue(other);

        await expect(retryOnPaymentNumberConflict(run)).rejects.toBe(other);
        expect(run).toHaveBeenCalledTimes(1);
    });

    it('tidak retry bila error bukan P2002 (mis. P2025)', async () => {
        const notFound = new Prisma.PrismaClientKnownRequestError('nope', {
            code: 'P2025',
            clientVersion: 'test',
        });
        const run = vi.fn().mockRejectedValue(notFound);

        await expect(retryOnPaymentNumberConflict(run)).rejects.toBe(notFound);
        expect(run).toHaveBeenCalledTimes(1);
    });

    it('tidak retry bila error biasa (bukan PrismaClientKnownRequestError)', async () => {
        const boom = new Error('boom');
        const run = vi.fn().mockRejectedValue(boom);

        await expect(retryOnPaymentNumberConflict(run)).rejects.toBe(boom);
        expect(run).toHaveBeenCalledTimes(1);
    });
});
