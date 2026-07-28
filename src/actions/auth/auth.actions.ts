'use server';

import { signIn, signOut } from '@/auth';
import { AuthError } from 'next-auth';
import { redirect } from 'next/navigation';

function isNextRedirectError(error: unknown): boolean {
    if (typeof error === 'object' && error !== null) {
        const digest = (error as { digest?: string }).digest;
        if (typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT')) {
            return true;
        }
    }
    return false;
}

export async function authenticate(
    prevState: string | undefined,
    formData: FormData,
) {
    try {
        const email = String(formData.get('email') ?? '');
        const password = String(formData.get('password') ?? '');
        const subdomain = String(formData.get('subdomain') ?? '');

        const remember = formData.get('remember') === 'on';

        await signIn('credentials', {
            email,
            password,
            subdomain,
            remember,
            redirect: false,
        });

        // We redirect to a common logged-in route.
        // The NextAuth middleware (auth.config.ts) will intercept this next request,
        // read the newly set session cookie, and perfectly redirect the user to their
        // designated workspace (e.g. /admin/super-admin, /warehouse, /production)
        // based on the role stored in the JWT.
        redirect('/dashboard');
    } catch (error) {
        if (isNextRedirectError(error)) {
            throw error;
        }

        if (error instanceof AuthError) {
            // Auth.js wraps errors thrown from authorize() as CredentialsSignin;
            // the original Error message is available on `.cause?.err?.message`.
            const causeMessage = (
                error as { cause?: { err?: { message?: string } } }
            )?.cause?.err?.message;

            if (causeMessage === 'TenantSuspended') {
                return 'Akun tenant ini telah dinonaktifkan (suspended). Silakan hubungi administrator.';
            }

            // Hide exact reason for all other cases to prevent user enumeration
            return 'Email atau kata sandi salah.';
        }

        console.error('Unexpected sign-in error:', error);
        return 'Login sedang bermasalah. Silakan coba lagi.';
    }
}

export async function logOut() {
    await signOut();
}
