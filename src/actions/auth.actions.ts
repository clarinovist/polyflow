'use server';

import { signIn, signOut } from '@/auth';
import { AuthError } from 'next-auth';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { defaultLocale, locales, Locale } from '@/i18n/config';

export async function authenticate(
    prevState: string | undefined,
    formData: FormData,
) {
    try {
        const email = String(formData.get('email') ?? '');
        const password = String(formData.get('password') ?? '');
        const role = String(formData.get('role') ?? '');

        let targetUrl = '/dashboard';
        const roleStr = role.toUpperCase();
        if (roleStr === 'WAREHOUSE') targetUrl = '/warehouse';
        else if (roleStr === 'PRODUCTION') targetUrl = '/production';
        else if (roleStr === 'SALES') targetUrl = '/sales';
        else if (roleStr === 'FINANCE') targetUrl = '/finance';
        else if (roleStr === 'PPIC' || roleStr === 'PROCUREMENT') targetUrl = '/planning';
        else targetUrl = '/dashboard';

        const remember = formData.get('remember') === 'on';

        await signIn('credentials', {
            email,
            password,
            role,
            remember,
            redirect: false,
        });

        const cookieStore = await cookies();
        const localeCookie = cookieStore.get('NEXT_LOCALE')?.value;
        const locale = (localeCookie && locales.includes(localeCookie as Locale)) ? (localeCookie as Locale) : defaultLocale;
        const localePrefix = locale && locale !== defaultLocale ? `/${locale}` : '';

        redirect(`${localePrefix}${targetUrl}`);
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
