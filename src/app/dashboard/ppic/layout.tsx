import { auth } from '@/auth';

import { redirect } from 'next/navigation';

export default async function PPICLayout({ children }: { children: React.ReactNode }) {
    const session = await auth();

    if (!session) {
        redirect('/login');
    }

    const user = {
        name: session.user?.name,
        email: session.user?.email,
        role: (session.user as { role?: string }).role || 'PPIC',
    };

    // Only PPIC and ADMIN may access this suite
    const isAuthorized = user.role === 'ADMIN' || user.role === 'PPIC';
    if (!isAuthorized) {
        redirect('/dashboard');
    }

    return (
        <div className="w-full">
            {children}
        </div>
    );
}
