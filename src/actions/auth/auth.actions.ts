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

        const remember = formData.get('remember') === 'on';

        await signIn('credentials', {
            email,
            password,
            role,
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
            // Hide exact reason to prevent user enumeration
            return 'Invalid email or password.';
        }

        // Rethrow redirect errors and other unknown errors
        throw error;
    }
}

export async function logOut() {
    await signOut();
}
