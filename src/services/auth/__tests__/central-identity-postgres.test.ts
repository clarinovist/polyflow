import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const admin = process.env.CENTRAL_IDENTITY_TEST_ADMIN_URL;
const enabled = !!admin;

function client(database: string) {
    if (!admin) throw new Error('Disposable central identity DB is required');
    const url = new URL(admin);
    url.pathname = `/${database}`;
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || !url.port)
        throw new Error('Central identity DB must be explicit loopback');
    return new PrismaClient({ datasources: { db: { url: url.toString() } } });
}

const main = enabled ? client('polyflow_central_main_test') : null;
const tenantA = enabled ? client('polyflow_central_tenant_a_test') : null;
const tenantB = enabled ? client('polyflow_central_tenant_b_test') : null;

describe.skipIf(!enabled)('central identity PostgreSQL isolation', () => {
    const suffix = randomUUID();
    const accountId = `account-${suffix}`;
    const tenantAId = `tenant-a-${suffix}`;
    const tenantBId = `tenant-b-${suffix}`;
    const localA = `local-a-${suffix}`;
    const localB = `local-b-${suffix}`;

    beforeAll(async () => {
        await main!.globalAccount.create({
            data: {
                id: accountId,
                issuer: 'https://accounts.google.com',
                subject: `subject-${suffix}`,
                email: `staff-${suffix}@example.test`,
                emailVerified: true,
            },
        });
        await main!.tenant.createMany({
            data: [
                {
                    id: tenantAId,
                    name: 'Synthetic A',
                    subdomain: `synthetic-a-${suffix}`,
                    dbUrl: 'postgresql://synthetic.invalid/a',
                },
                {
                    id: tenantBId,
                    name: 'Synthetic B',
                    subdomain: `synthetic-b-${suffix}`,
                    dbUrl: 'postgresql://synthetic.invalid/b',
                },
            ],
        });
        await tenantA!.user.create({
            data: {
                id: localA,
                email: `a-${suffix}@example.test`,
                password: randomUUID(),
                role: 'FINANCE',
                authMode: 'CENTRAL',
                centralAccountId: accountId,
            },
        });
        await tenantB!.user.create({
            data: {
                id: localB,
                email: `b-${suffix}@example.test`,
                password: randomUUID(),
                role: 'WAREHOUSE',
                authMode: 'CENTRAL',
                centralAccountId: accountId,
            },
        });
        await main!.tenantMembership.createMany({
            data: [
                {
                    globalAccountId: accountId,
                    tenantId: tenantAId,
                    tenantUserId: localA,
                    status: 'ACTIVE',
                    activatedAt: new Date(),
                },
                {
                    globalAccountId: accountId,
                    tenantId: tenantBId,
                    tenantUserId: localB,
                    status: 'ACTIVE',
                    activatedAt: new Date(),
                },
            ],
        });
    });

    afterAll(async () => {
        await main?.$disconnect();
        await tenantA?.$disconnect();
        await tenantB?.$disconnect();
    });

    it('keeps one central account mapped to distinct tenant-local actors', async () => {
        const memberships = await main!.tenantMembership.findMany({
            where: { globalAccountId: accountId },
            orderBy: { tenantId: 'asc' },
        });
        expect(memberships).toHaveLength(2);
        expect(new Set(memberships.map((row) => row.tenantUserId))).toEqual(
            new Set([localA, localB]),
        );
        expect(
            (await tenantA!.user.findUnique({ where: { id: localA } }))?.role,
        ).toBe('FINANCE');
        expect(
            (await tenantB!.user.findUnique({ where: { id: localB } }))?.role,
        ).toBe('WAREHOUSE');
    });

    it('revokes tenant B without changing tenant A', async () => {
        const tenantBMembership = await main!.tenantMembership.findUniqueOrThrow({
            where: {
                globalAccountId_tenantId: {
                    globalAccountId: accountId,
                    tenantId: tenantBId,
                },
            },
        });
        await main!.tenantMembership.update({
            where: {
                id: tenantBMembership.id,
                membershipVersion: tenantBMembership.membershipVersion,
            },
            data: {
                status: 'REVOKED',
                revokedAt: new Date(),
                membershipVersion: { increment: 1 },
            },
        });
        const [a, b] = await Promise.all([
            main!.tenantMembership.findUniqueOrThrow({
                where: {
                    globalAccountId_tenantId: {
                        globalAccountId: accountId,
                        tenantId: tenantAId,
                    },
                },
            }),
            main!.tenantMembership.findUniqueOrThrow({
                where: {
                    globalAccountId_tenantId: {
                        globalAccountId: accountId,
                        tenantId: tenantBId,
                    },
                },
            }),
        ]);
        expect(a.status).toBe('ACTIVE');
        expect(b.status).toBe('REVOKED');
    });

    it('database constraints reject a second actor for the same account and tenant', async () => {
        await expect(
            main!.tenantMembership.create({
                data: {
                    globalAccountId: accountId,
                    tenantId: tenantAId,
                    tenantUserId: `other-${suffix}`,
                },
            }),
        ).rejects.toMatchObject({ code: 'P2002' });
    });
});
