import fs from 'fs';
import path from 'path';
import { ChangelogBannerClient } from './changelog-banner-client';

const FALLBACK_SUMMARIES = ['Pembaruan pengalaman Polyflow tersedia.'];
const TECHNICAL_OR_PRIVATE_CONTENT =
    /\b(?:admin|api|applicationerror|auth|backend|cache|commit|credential|cron|database|deploy(?:ment)?|endpoint|environment|foreign key|internal|migration|observability|permissions?|prisma|private|r2|schema|secret|server|superadmin|tenant|token|topology|webhook)\b|\b(?:ci|cors|crud|db|fk)\b|throw new error|https?:\/\/|\/[a-z0-9_-]+\/[a-z0-9_[\]-]+/i;
const CONVENTIONAL_ENTRY =
    /^(?:(?:build|chore|ci|docs|feat(?:ure)?|fix|perf|refactor|style|test)(?:\(([^)]+)\))?!?:|\*\*([^*]+):\*\*)\s*(.+)$/i;

type TranslationRule = {
    scopes: readonly string[];
    source: RegExp;
    summary: string;
};

/**
 * Deliberately small allowlist: a note is shown only when its complete meaning
 * is known. Partially translated source text must never reach the user.
 */
const TRANSLATION_RULES: readonly TranslationRule[] = [
    {
        scopes: ['360'],
        source: /^sales customer \+ supplier \+ warehouse product 360 profiles$/i,
        summary:
            'Profil menyeluruh pelanggan, pemasok, dan produk gudang kini tersedia.',
    },
    {
        scopes: ['accounting'],
        source: /^simplify direct labor journal input$/i,
        summary: 'Pencatatan jurnal tenaga kerja langsung kini lebih sederhana.',
    },
    {
        scopes: ['customer'],
        source: /^default vehicle dropdown in customer form$/i,
        summary: 'Pilihan kendaraan bawaan kini tersedia di formulir pelanggan.',
    },
    {
        scopes: ['sales'],
        source: /^improve customer order search$/i,
        summary: 'Pencarian pesanan pelanggan kini lebih mudah.',
    },
    {
        scopes: ['dashboard'],
        source: /^add clearer daily performance cards$/i,
        summary: 'Kartu kinerja harian kini lebih jelas.',
    },
    {
        scopes: ['nav', 'navigation'],
        source: /^enable faster access to frequent work$/i,
        summary: 'Akses ke pekerjaan yang sering digunakan kini lebih cepat.',
    },
    {
        scopes: ['products'],
        source: /^add simpler product filters$/i,
        summary: 'Penyaring produk kini lebih sederhana.',
    },
];

interface ReleaseAnnouncement {
    version: string;
    summaries: string[];
}

function toSafeUserSummary(entry: string): string | null {
    const withoutCommitLink = entry
        .replace(/\s*\(\[[0-9a-f]{7,40}\]\([^)]+\)\)\s*$/i, '')
        .trim();

    if (
        withoutCommitLink.length > 180 ||
        TECHNICAL_OR_PRIVATE_CONTENT.test(withoutCommitLink) ||
        /\[[^\]]+\]\([^)]+\)|[`~]|<[^>]+>/.test(withoutCommitLink)
    ) {
        return null;
    }

    const conventional = CONVENTIONAL_ENTRY.exec(withoutCommitLink);
    if (!conventional) return null;

    const scope = (conventional[1] ?? conventional[2])
        .trim()
        .toLocaleLowerCase('id-ID');
    const source = conventional[3].replace(/\s+/g, ' ').trim();
    const rule = TRANSLATION_RULES.find(
        (candidate) =>
            candidate.scopes.includes(scope) && candidate.source.test(source),
    );

    return rule?.summary ?? null;
}

/** Derive a small, non-technical announcement from the newest version only. */
export function parseLatestRelease(content: string): ReleaseAnnouncement | null {
    const versionMatch = /^##\s+\[([^\]]+)\](?:\([^)]+\))?[^\n]*$/m.exec(
        content,
    );
    if (!versionMatch || versionMatch.index === undefined) return null;

    const sectionStart = versionMatch.index + versionMatch[0].length;
    const remainder = content.slice(sectionStart);
    const nextVersionOffset = remainder.search(/^##\s+/m);
    const latestSection =
        nextVersionOffset === -1
            ? remainder
            : remainder.slice(0, nextVersionOffset);
    const summaries = Array.from(
        new Set(
            latestSection
                .split('\n')
                .map((line) => /^\s*[-*]\s+(.+)$/.exec(line)?.[1])
                .filter((entry): entry is string => Boolean(entry))
                .map(toSafeUserSummary)
                .filter((summary): summary is string => Boolean(summary)),
        ),
    ).slice(0, 3);

    return {
        version: versionMatch[1],
        summaries:
            summaries.length > 0 ? summaries : [...FALLBACK_SUMMARIES],
    };
}

function readLatestRelease(): ReleaseAnnouncement | null {
    try {
        const filePath = path.join(process.cwd(), 'CHANGELOG.md');
        if (!fs.existsSync(filePath)) return null;

        return parseLatestRelease(fs.readFileSync(filePath, 'utf-8'));
    } catch (error) {
        console.error('Failed to prepare release announcement:', error);
        return null;
    }
}

export function AutoChangelogBanner() {
    const release = readLatestRelease();
    if (!release) return null;

    return <ChangelogBannerClient {...release} />;
}
