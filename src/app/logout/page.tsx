'use client';

import { useEffect } from 'react';
import { signOut } from 'next-auth/react';

export default function LogoutPage() {
    useEffect(() => {
        signOut({ callbackUrl: '/login' });
    }, []);

    return (
        <div className="flex min-h-screen items-center justify-center">
            <div className="text-center">
                <p className="text-muted-foreground">Logging out...</p>
            </div>
        </div>
    );
}
