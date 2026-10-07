import { auth } from '@/auth';
import { hasWorkspaceEntitlement } from '@/lib/auth/access-policy';
import { redirect } from 'next/navigation';

/**
 * Route-neutral gate for every /field portal. Portal-specific chrome and
 * authorization belong to the nested Sales or Marketing layout.
 */
export default async function FieldLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await auth();
    if (!session) redirect('/login');

    if (!hasWorkspaceEntitlement('sales')) {
        redirect('/error?error=ModuleNotEntitled');
    }

    return children;
}
