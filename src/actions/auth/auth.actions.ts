'use server';

import { signIn, signOut } from '@/auth';
import { AuthError } from 'next-auth';
import { redirect } from 'next/navigation';

export async function authenticate(
    prevState: string | undefined,
    formData: FormData,
) {
    try {
        const email = String(formData.get('email') ?? '');
        const password = String(formData.get('password') ?? '');
        const role = String(formData.get('role') ?? '');
        const subdomain = String(formData.get('subdomain') ?? '');

        const remember = formData.get('remember') === 'on';

        await signIn('credentials', {
            email,
            password,
            role,
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
        if (error instanceof AuthError) {
            // Auth.js wraps errors thrown from authorize() as CredentialsSignin;
            // the original Error message is available on `.cause?.err?.message`.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const causeMessage = (error as any)?.cause?.err?.message as string | undefined;

            if (causeMessage === 'TenantSuspended') {
                return 'Akun tenant ini telah dinonaktifkan (suspended). Silakan hubungi administrator.';
            }

            // Hide exact reason for all other cases to prevent user enumeration
            return 'Invalid email or password.';
        }

        // Rethrow redirect errors and other unknown errors
        throw error;
    }
}

export async function logOut() {
    await signOut();
}
