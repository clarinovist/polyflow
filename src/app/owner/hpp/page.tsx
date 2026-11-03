import { readOwnerHppWorkspace } from '@/actions/owner-hpp/owner-hpp-query';
import { requireOwnerHppAccess } from '@/lib/auth/owner-hpp-access';
import { withTenantPage } from '@/lib/core/tenant';
import { AuthorizationError } from '@/lib/errors/errors';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { OwnerHppClient } from './OwnerHppClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Kalkulator HPP',
    robots: { index: false, follow: false },
};

/**
 * The edge lets /owner through without a login, and layouts are not a safe
 * place for access checks, so the page runs the guard itself. Anyone who fails
 * it sees a plain 404 rather than a hint that the page exists.
 */
const loadOwnerHpp = withTenantPage(async () => {
    try {
        const { db, userId } = await requireOwnerHppAccess();
        return await readOwnerHppWorkspace(db, userId);
    } catch (error) {
        if (error instanceof AuthorizationError) notFound();
        throw error;
    }
});

export default async function OwnerHppPage() {
    const initial = await loadOwnerHpp();
    return <OwnerHppClient initial={initial} />;
}
