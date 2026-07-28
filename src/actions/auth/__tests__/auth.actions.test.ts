import { describe, expect, it, vi, beforeEach } from 'vitest';
import { authenticate } from '../auth.actions';
import { signIn } from '@/auth';
import { AuthError } from 'next-auth';

vi.mock('@/auth', () => ({
    signIn: vi.fn(),
    signOut: vi.fn(),
}));

vi.mock('next/navigation', () => ({
    redirect: vi.fn((url: string) => {
        const err = new Error(`NEXT_REDIRECT:${url}`);
        (err as { digest?: string }).digest = `NEXT_REDIRECT;${url}`;
        throw err;
    }),
}));

describe('Auth Actions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('authenticate', () => {
        it('calls signIn with credentials excluding role field', async () => {
            const formData = new FormData();
            formData.append('email', 'user@example.com');
            formData.append('password', 'secret123');
            formData.append('subdomain', 'kiyowo');
            formData.append('remember', 'on');

            vi.mocked(signIn).mockResolvedValueOnce(undefined as never);

            await expect(authenticate(undefined, formData)).rejects.toThrow(
                'NEXT_REDIRECT:/dashboard',
            );

            expect(signIn).toHaveBeenCalledWith('credentials', {
                email: 'user@example.com',
                password: 'secret123',
                subdomain: 'kiyowo',
                remember: true,
                redirect: false,
            });
        });

        it('returns generic error for invalid credentials', async () => {
            const formData = new FormData();
            formData.append('email', 'wrong@example.com');
            formData.append('password', 'badpassword');

            const error = new AuthError('CredentialsSignin');
            vi.mocked(signIn).mockRejectedValueOnce(error);

            const result = await authenticate(undefined, formData);
            expect(result).toBe('Email atau kata sandi salah.');
        });

        it('returns tenant suspended error message when TenantSuspended error is thrown', async () => {
            const formData = new FormData();
            formData.append('email', 'user@example.com');
            formData.append('password', 'secret123');

            const error = Object.assign(new AuthError('CredentialsSignin'), {
                cause: { err: { message: 'TenantSuspended' } },
            });
            vi.mocked(signIn).mockRejectedValueOnce(error);

            const result = await authenticate(undefined, formData);
            expect(result).toBe(
                'Akun tenant ini telah dinonaktifkan (suspended). Silakan hubungi administrator.',
            );
        });

        it('returns friendly inline error message for unexpected non-AuthError failures', async () => {
            const formData = new FormData();
            formData.append('email', 'user@example.com');
            formData.append('password', 'secret123');

            vi.mocked(signIn).mockRejectedValueOnce(new Error('DB Connection Timeout'));

            const result = await authenticate(undefined, formData);
            expect(result).toBe('Login sedang bermasalah. Silakan coba lagi.');
        });
    });
});
