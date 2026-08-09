export interface NavArticleItem {
    slug: string;
    title: string;
    modules: string[];
    tags: string[];
    errorCodes: string[];
}

/**
 * An article belongs on the "Troubleshooting" tab when it's tagged
 * `troubleshoot` or it lists at least one error code. Kept client-safe so
 * docs sidebar can filter without importing server-only Prisma helpers.
 */
export function isTroubleshootArticle(article: {
    tags: string[];
    errorCodes: string[];
}): boolean {
    return (
        article.tags.includes('troubleshoot') || article.errorCodes.length > 0
    );
}
