'use server';

import { signIn, signOut } from '@/auth';
import { AuthError } from 'next-auth';

export async function authenticate(
    prevState: string | undefined,
    formData: FormData,
) {
    try {
        const email = String(formData.get('email') ?? '');
        const password = String(formData.get('password') ?? '');
        const role = String(formData.get('role') ?? '');

        let targetUrl = '/dashboard';
        if (role === 'WAREHOUSE') targetUrl = '/warehouse';
        if (role === 'PRODUCTION') targetUrl = '/production';

        await signIn('credentials', {
            email,
            password,
            role,
            redirectTo: targetUrl,
            callbackUrl: targetUrl,
        });
    } catch (error) {
        if (error instanceof AuthError) {
            switch (error.type) {
                case 'CredentialsSignin':
                    return 'Invalid email or password.';
                default:
                    const errorMessage = error.cause?.err?.message;
                    if (errorMessage === 'UserNotFound') {
                        return 'This account is not registered in our system.';
                    }
                    if (errorMessage === 'RoleMismatch') {
                        return 'You do not have permission to access this workspace with your account.';
                    }
                    return 'Something went wrong. Please try again.';
            }
        }
        throw error;
    }
}

export async function logOut() {
    await signOut();
}
