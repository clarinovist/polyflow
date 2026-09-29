import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { workflowGuides } from '../knowledge/workflow-guides';
import { resolutionGuides } from '../knowledge/resolution-guides';
import { previewGuides, publishGuides } from '../../../../scripts/publish-assistant-guides.mjs';
const connection = process.env.RETURN_CREDIT_TEST_DATABASE_URL;
let db: PrismaClient;
if (connection) {
    const url = new URL(connection);
    if (url.hostname !== '127.0.0.1' || url.port !== '55439' || url.pathname !== '/polyflow_return_credit_scope_test') throw new Error('Only disposable CI PostgreSQL allowed');
    db = new PrismaClient({ datasources: { db: { url: connection } } });
}
vi.mock('@/lib/core/prisma', () => ({ getMainPrisma: () => db }));
import { searchHelpArticles } from '../help-articles';
const actorId = 'assistant-guides-synthetic-admin';

describe.skipIf(!connection)('assistant guide publication and ranking on PostgreSQL', () => {
    beforeAll(async () => {
        const marker = await db.$queryRaw<Array<{ purpose: string }>>`SELECT purpose FROM "ReturnCreditDisposableMarker"`;
        expect(marker[0]?.purpose).toBe('return-credit-synthetic-only');
        await db.user.create({ data: { id: actorId, name: 'Synthetic admin', email: 'assistant-guides@example.invalid', password: 'not-a-login', isSuperAdmin: true } });
    });
    afterAll(async () => {
        await db.auditLog.deleteMany({ where: { userId: actorId } });
        await db.helpArticle.deleteMany({ where: { slug: { in: [...workflowGuides.map(g => g.slug), ...resolutionGuides.map(g => g.slug), 'synthetic-unrelated', 'synthetic-private'] } } });
        await db.user.delete({ where: { id: actorId } });
        await db.$disconnect();
    });
    it('previews, publishes atomically with audit, and is idempotent', async () => {
        const backup = await previewGuides(db, workflowGuides);
        expect(await db.helpArticle.count()).toBe(0);
        expect(await publishGuides(db, workflowGuides, backup, actorId)).toEqual({ changed: 4 });
        expect(await publishGuides(db, workflowGuides, backup, actorId)).toEqual({ changed: 0 });
        expect(await db.auditLog.count({ where: { userId: actorId } })).toBe(4);
        expect(await db.helpArticle.count()).toBe(4);
    });
    it('ranks matching content before popular unrelated guides and excludes drafts', async () => {
        await db.helpArticle.create({ data: { slug: 'synthetic-unrelated', title: 'Cara Cek Stok', summary: 'Panduan gudang', bodyMd: 'Stok', modules: ['warehouse'], tags: ['stok'], status: 'PUBLISHED', helpfulCount: 999 } });
        await db.helpArticle.create({ data: { slug: 'synthetic-private', title: 'Cara closed PO', summary: 'Rahasia belum terbit', bodyMd: 'PRIVATE', tags: ['po', 'closed'], status: 'DRAFT', helpfulCount: 999 } });
        const result = await searchHelpArticles('cara closed PO', undefined, 1);
        expect(result.map(r => r.slug)).toEqual(['cara-menutup-po-diterima-sebagian']);
        expect(result[0].bodyExcerpt).toContain('Alasan penutupan');
        expect(await searchHelpArticles('cara closed PO', 'hrd', 3)).toEqual([]);
        expect((await searchHelpArticles('cara mengisi retur finance', undefined, 3)).every(r => r.modules.includes('finance'))).toBe(true);
        expect(await searchHelpArticles("x' OR 1=1 --")).toEqual([]);
    });
    it('fails closed for invalid actor, corrupt backup and concurrent edits', async () => {
        const backup = await previewGuides(db, workflowGuides);
        await expect(publishGuides(db, workflowGuides, backup, 'foreign')).rejects.toThrow('superadmin');
        await expect(publishGuides(db, workflowGuides, { ...backup, fingerprint: 'wrong' }, actorId)).rejects.toThrow('mismatch');
        await db.helpArticle.update({ where: { slug: workflowGuides[0].slug }, data: { title: 'Concurrent editorial change' } });
        await expect(publishGuides(db, workflowGuides, backup, actorId)).rejects.toThrow('changed since preview');
        expect(await db.auditLog.count({ where: { userId: actorId } })).toBe(4);
    });
    it('publishes resolution guides without rewriting older articles and refuses occupied slugs', async () => {
        const before = await db.helpArticle.findMany({ where: { slug: { in: workflowGuides.map(g => g.slug) } }, orderBy: { slug: 'asc' } });
        const backup = await previewGuides(db, resolutionGuides);
        expect(backup.before).toEqual([]);
        expect(await publishGuides(db, resolutionGuides, backup, actorId)).toEqual({ changed: 4 });
        expect(await publishGuides(db, resolutionGuides, backup, actorId)).toEqual({ changed: 0 });
        expect(await db.helpArticle.findMany({ where: { slug: { in: workflowGuides.map(g => g.slug) } }, orderBy: { slug: 'asc' } })).toEqual(before);
        expect((await searchHelpArticles('purchase invoice draft', 'finance', 3)).map(r => r.slug)).toContain('invoice-purchase-draft-dan-approval');
        await db.helpArticle.update({ where: { slug: resolutionGuides[0].slug }, data: { title: 'Existing editorial change' } });
        const fresh = await previewGuides(db, resolutionGuides);
        await expect(publishGuides(db, resolutionGuides, fresh, actorId)).rejects.toThrow('refusing overwrite');
    });
    it('rolls article changes back if audit insertion fails', async () => {
        const backup = await previewGuides(db, workflowGuides);
        await db.$executeRawUnsafe(`ALTER TABLE "AuditLog" ADD CONSTRAINT "synthetic_guide_audit_failure" CHECK ("action" != 'HELP_ARTICLE_PUBLISHED') NOT VALID`);
        try {
            await expect(publishGuides(db, workflowGuides, backup, actorId)).rejects.toThrow();
            expect((await db.helpArticle.findUniqueOrThrow({ where: { slug: workflowGuides[0].slug } })).title).toBe('Concurrent editorial change');
        } finally { await db.$executeRawUnsafe('ALTER TABLE "AuditLog" DROP CONSTRAINT "synthetic_guide_audit_failure"'); }
    });
});
