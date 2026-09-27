// Scoped replacement for the archived all-article seed. No business tables are changed.
// Preview: node /tmp/publish-assistant-guides.mjs /tmp/guides.json /secure/backup.json
// Apply:   node /tmp/publish-assistant-guides.mjs /tmp/guides.json /secure/backup.json --apply
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

export const guideFingerprint = (value) =>
    createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fields = {
    slug: true,
    title: true,
    summary: true,
    bodyMd: true,
    modules: true,
    tags: true,
    status: true,
    version: true,
    source: true,
    publishedAt: true,
    createdBy: true,
    updatedBy: true,
    id: true,
};
const allowedSlugs = [
    'cara-menutup-po-diterima-sebagian',
    'cara-menghapus-po',
    'cara-retur-penjualan-dan-kredit-finance',
    'cara-retur-dan-potong-tagihan',
];
function validate(guides) {
    if (
        !Array.isArray(guides) ||
        guides.length !== allowedSlugs.length ||
        new Set(guides.map((g) => g.slug)).size !== allowedSlugs.length
    )
        throw new Error('Expected exactly the reviewed guide set');
    for (const guide of guides) {
        if (
            !allowedSlugs.includes(guide.slug) ||
            !guide.title ||
            !guide.summary ||
            !guide.bodyMd ||
            guide.bodyMd.length > 6000 ||
            !Array.isArray(guide.modules) ||
            !Array.isArray(guide.tags)
        )
            throw new Error('Invalid guide');
    }
}
async function snapshot(db) {
    return db.helpArticle.findMany({
        where: { slug: { in: allowedSlugs } },
        select: fields,
        orderBy: { slug: 'asc' },
    });
}
export async function previewGuides(db, guides) {
    validate(guides);
    const before = await snapshot(db);
    return {
        manifest: guideFingerprint(guides),
        before: JSON.parse(JSON.stringify(before)),
        fingerprint: guideFingerprint(before),
    };
}

export async function publishGuides(db, guides, backup, actorId) {
    validate(guides);
    if (
        backup.manifest !== guideFingerprint(guides) ||
        backup.fingerprint !== guideFingerprint(backup.before)
    )
        throw new Error('Backup or manifest mismatch');
    return db.$transaction(
        async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(728146293)`;
            const actor = await tx.user.findFirst({
                where: { id: actorId, isSuperAdmin: true, isActive: true },
                select: { id: true },
            });
            if (!actor) throw new Error('Verified superadmin actor required');
            const current = await snapshot(tx);
            // Identical re-runs are harmless; a conflicting edit must be previewed again.
            const matches = (row, guide) =>
                row &&
                row.status === 'PUBLISHED' &&
                ['title', 'summary', 'bodyMd', 'modules', 'tags'].every(
                    (key) =>
                        JSON.stringify(row[key]) === JSON.stringify(guide[key]),
                );
            if (
                guides.every((g) =>
                    matches(
                        current.find((row) => row.slug === g.slug),
                        g,
                    ),
                )
            )
                return { changed: 0 };
            if (guideFingerprint(current) !== backup.fingerprint)
                throw new Error('Articles changed since preview; abort');
            let changed = 0;
            for (const guide of guides) {
                const previous = current.find((row) => row.slug === guide.slug);
                if (matches(previous, guide)) continue;
                const data = {
                    title: guide.title,
                    summary: guide.summary,
                    bodyMd: guide.bodyMd,
                    modules: [...guide.modules],
                    tags: [...guide.tags],
                    status: 'PUBLISHED',
                    source: 'HUMAN',
                    publishedAt: new Date(),
                    updatedBy: actorId,
                };
                const article = await tx.helpArticle.upsert({
                    where: { slug: guide.slug },
                    create: {
                        ...data,
                        slug: guide.slug,
                        createdBy: actorId,
                        version: 1,
                        errorCodes: [],
                    },
                    update: { ...data, version: { increment: 1 } },
                });
                await tx.auditLog.create({
                    data: {
                        userId: actorId,
                        action: 'HELP_ARTICLE_PUBLISHED',
                        entityType: 'HelpArticle',
                        entityId: article.id,
                        details: `Reviewed assistant workflow guide: ${guide.slug}`,
                        changes: {
                            previousVersion: previous?.version ?? null,
                            version: article.version,
                            manifest: backup.manifest,
                        },
                    },
                });
                changed++;
            }
            return { changed };
        },
        { isolationLevel: 'Serializable' },
    );
}

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href
) {
    const [input, backupPath, apply] = process.argv.slice(2);
    if (!input || !backupPath || (apply && apply !== '--apply'))
        throw new Error('Manifest and backup path required; --apply optional');
    // Resolve the Prisma runtime from the deployed app, not an untrusted manifest.
    const require = createRequire(`${process.cwd()}/package.json`);
    const { PrismaClient } = require('@prisma/client');
    const db = new PrismaClient();
    try {
        const guides = JSON.parse(await readFile(input, 'utf8'));
        if (!apply) {
            const backup = await previewGuides(db, guides);
            await writeFile(backupPath, JSON.stringify(backup, null, 2), {
                flag: 'wx',
                mode: 0o600,
            });
            console.log(
                JSON.stringify({
                    mode: 'preview',
                    existing: backup.before.length,
                    articles: guides.map((g) => g.slug),
                    manifest: backup.manifest,
                }),
            );
        } else {
            const backup = JSON.parse(await readFile(backupPath, 'utf8'));
            const actor = await db.user.findMany({
                where: { isSuperAdmin: true, isActive: true },
                select: { id: true },
                take: 2,
            });
            if (actor.length !== 1)
                throw new Error(
                    'Expected one verified superadmin; use reviewed publisher with explicit actor if ambiguous',
                );
            console.log(
                JSON.stringify(
                    await publishGuides(db, guides, backup, actor[0].id),
                ),
            );
        }
    } finally {
        await db.$disconnect();
    }
}
