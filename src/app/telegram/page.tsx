'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TelegramProvider, useTelegram } from './components/telegram-provider';
import { SkeletonList } from './components/skeleton';
import { ErrorState } from './components/error-states';

type BootstrapStatus =
    | 'loading'
    | 'linked'
    | 'unlinked'
    | 'tenant_not_found'
    | 'revoked'
    | 'not_admin'
    | 'not_allowlisted'
    | 'expired'
    | 'invalid'
    | 'error';

function InnerPage() {
    const { initData, isReady, platform } = useTelegram();
    const router = useRouter();
    const [status, setStatus] = useState<BootstrapStatus>('loading');
    const [errorText, setErrorText] = useState('');
    const [telegramUser, setTelegramUser] = useState<{
        id: number;
        username?: string;
        firstName?: string;
    } | null>(null);
    const [linkToken, setLinkToken] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [linking, setLinking] = useState(false);
    const [linkError, setLinkError] = useState('');

    const isInTelegram =
        !!initData ||
        platform === 'android' ||
        platform === 'ios' ||
        platform === 'tdesktop' ||
        platform === 'macos';

    useEffect(() => {
        if (!isReady) return;
        const doBootstrap = async () => {
            try {
                const res = await fetch('/api/telegram/mini-app/session', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ initData }),
                });
                const data = (await res
                    .json()
                    .catch(() => ({}) as Record<string, unknown>)) as Record<
                    string,
                    string
                >;

                if (!res.ok) {
                    const s = data.status || data.error || '';
                    if (res.status === 404 || s === 'TENANT_NOT_FOUND') {
                        setStatus('tenant_not_found');
                        setErrorText(
                            data.error || 'Tenant pilot tidak ditemukan',
                        );
                        return;
                    }
                    if (res.status === 403) {
                        if (
                            data.status === 'NOT_ADMIN' ||
                            data.status === 'ADMIN_BLOCKED'
                        ) {
                            setStatus('not_admin');
                            return;
                        }
                        if (
                            data.status === 'NOT_ALLOWLISTED' ||
                            data.status === 'ALLOWLIST_BLOCKED'
                        ) {
                            setStatus('not_allowlisted');
                            return;
                        }
                        if (
                            data.status === 'REVOKED' ||
                            data.status === 'USER_INACTIVE'
                        ) {
                            setStatus('revoked');
                            setErrorText(data.error || 'Akses ditolak');
                            return;
                        }
                    }
                    if (res.status === 401) {
                        if (data.status === 'EXPIRED') {
                            setStatus('expired');
                            return;
                        }
                        setStatus('invalid');
                        setErrorText(data.error || 'Session tidak valid');
                        return;
                    }
                    setStatus('error');
                    setErrorText(data.error || 'Gagal verifikasi');
                    return;
                }

                if (
                    data.status === 'UNLINKED' ||
                    data.status === 'LINK_START'
                ) {
                    setStatus('unlinked');
                    const tu = (data as Record<string, unknown>)
                        .telegramUser as
                        | { id: number; username?: string; firstName?: string }
                        | undefined;
                    if (tu) setTelegramUser(tu);
                    return;
                }
                if (data.status === 'LINKED') {
                    setStatus('linked');
                    router.replace('/telegram/home');
                    return;
                }
                setStatus('error');
                setErrorText('Response tidak dikenali');
            } catch (e) {
                setStatus('error');
                setErrorText(e instanceof Error ? e.message : 'Network error');
            }
        };
        doBootstrap();
    }, [isReady, initData, router]);

    const handleLink = async (mode: 'token' | 'email') => {
        setLinking(true);
        setLinkError('');
        try {
            const payload: Record<string, string> = { initData };
            if (mode === 'token') {
                if (!linkToken.trim()) {
                    setLinkError('Token harus diisi');
                    setLinking(false);
                    return;
                }
                payload.token = linkToken.trim();
            } else {
                if (!email.trim() || !password) {
                    setLinkError('Email dan password wajib');
                    setLinking(false);
                    return;
                }
                payload.email = email.trim();
                payload.password = password;
            }

            const res = await fetch('/api/telegram/mini-app/link', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload),
            });
            const data = (await res
                .json()
                .catch(() => ({}) as Record<string, unknown>)) as Record<
                string,
                string
            >;
            if (!res.ok) {
                setLinkError(data.error || 'Gagal menghubungkan');
                setLinking(false);
                return;
            }
            setStatus('linked');
            router.replace('/telegram/home');
        } catch (e) {
            setLinkError(e instanceof Error ? e.message : 'Network error');
        } finally {
            setLinking(false);
        }
    };

    if (!isReady || status === 'loading' || status === 'linked') {
        return (
            <div className="mx-auto max-w-[480px] p-4">
                <div className="mb-6 flex items-center justify-between">
                    <h1 className="text-lg font-bold">Polyflow</h1>
                    <span className="text-xs opacity-60">
                        Memverifikasi Telegram
                    </span>
                </div>
                <SkeletonList count={4} />
                <p className="mt-4 text-center text-xs opacity-50">
                    {isReady
                        ? 'Memverifikasi...'
                        : 'Menyiapkan Telegram SDK...'}
                </p>
            </div>
        );
    }

    if (status === 'tenant_not_found') {
        return (
            <ErrorState
                title="Tenant tidak ditemukan"
                message="Pastikan Anda membuka dari melindo.polyflow.uk dan hubungi admin tenant."
                actionLabel="Muat ulang"
                onAction={() => window.location.reload()}
            />
        );
    }
    if (status === 'revoked') {
        return (
            <ErrorState
                title="Akses ditolak"
                message={
                    errorText ||
                    'Akun Telegram Anda sudah di-revoke. Hubungi admin.'
                }
                actionLabel="Bantuan"
                onAction={() =>
                    window.open('https://polyflow.uk/support', '_blank')
                }
            />
        );
    }
    if (status === 'not_admin') {
        return (
            <ErrorState
                title="Hanya ADMIN"
                message="Pilot Telegram Mini App hanya untuk user Polyflow dengan role ADMIN."
            />
        );
    }
    if (status === 'not_allowlisted') {
        return (
            <ErrorState
                title="Tidak masuk allowlist"
                message="Email Anda belum masuk daftar admin pilot Telegram. Hubungi admin tenant Melindo."
            />
        );
    }
    if (status === 'expired') {
        return (
            <ErrorState
                title="Sesi kadaluarsa"
                message="Buka ulang Mini App dari menu bot @pico2004_bot."
                actionLabel="Muat ulang Mini App"
                onAction={() => window.location.reload()}
            />
        );
    }
    if (status === 'invalid') {
        return (
            <ErrorState
                title="Sesi tidak valid"
                message={
                    errorText || 'initData tidak valid. Buka ulang dari bot.'
                }
                actionLabel="Muat ulang"
                onAction={() => window.location.reload()}
            />
        );
    }
    if (status === 'error') {
        return (
            <ErrorState
                title="Gagal memuat"
                message={errorText || 'Terjadi kesalahan jaringan.'}
                actionLabel="Coba lagi"
                onAction={() => window.location.reload()}
            />
        );
    }

    return (
        <div className="mx-auto flex min-h-[80vh] max-w-[420px] flex-col gap-6 p-5">
            <div className="py-6 text-center">
                <h1 className="text-xl font-bold">Polyflow</h1>
                <p className="mt-1 text-sm opacity-70">
                    Data operasional Anda di Telegram
                </p>
            </div>

            <div className="tg-card p-4">
                <h2 className="text-sm font-semibold">
                    Hubungkan akun Polyflow
                </h2>
                <p className="mt-1 text-xs opacity-70">
                    {telegramUser
                        ? `Terdeteksi Telegram: @${telegramUser.username || telegramUser.id}`
                        : 'Akun Telegram belum terhubung ke user Polyflow.'}
                    {!isInTelegram &&
                        ' (Browser dev mode — initData kosong, gunakan email/password untuk test)'}
                </p>

                <div className="mt-4 space-y-4">
                    <div>
                        <label className="text-xs font-medium">
                            Link via token (disarankan)
                        </label>
                        <p className="mb-2 text-[11px] opacity-60">
                            Dapatkan token one-time 10 menit dari Polyflow web:
                            Dashboard → Settings → Telegram atau minta admin
                            generate.
                        </p>
                        <div className="flex gap-2">
                            <input
                                value={linkToken}
                                onChange={(e) => setLinkToken(e.target.value)}
                                placeholder="Paste token..."
                                className="flex-1 rounded-full border px-4 py-2.5 text-sm"
                            />
                            <button
                                onClick={() => handleLink('token')}
                                disabled={linking}
                                className="rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
                                style={{ minHeight: 44 }}
                            >
                                {linking ? '...' : 'Hubungkan'}
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="h-px flex-1 bg-black/10 dark:bg-white/10" />
                        <span className="text-[11px] opacity-50">atau</span>
                        <div className="h-px flex-1 bg-black/10 dark:bg-white/10" />
                    </div>

                    <div className="space-y-3">
                        <label className="text-xs font-medium">
                            Login langsung (fallback pilot)
                        </label>
                        <input
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="Email ADMIN"
                            type="email"
                            className="w-full rounded-full border px-4 py-2.5 text-sm"
                        />
                        <input
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Password"
                            type="password"
                            className="w-full rounded-full border px-4 py-2.5 text-sm"
                        />
                        <button
                            onClick={() => handleLink('email')}
                            disabled={linking}
                            className="w-full rounded-full border bg-transparent px-5 py-2.5 text-sm font-medium disabled:opacity-50"
                            style={{ minHeight: 44 }}
                        >
                            {linking ? 'Menghubungkan...' : 'Login & Hubungkan'}
                        </button>
                    </div>

                    {linkError && (
                        <p className="text-xs text-red-600">{linkError}</p>
                    )}

                    <div className="pt-2 text-[11px] opacity-50">
                        Hanya role ADMIN + allowlist pilot Melindo yang dapat
                        terhubung. Token sekali pakai & kadaluarsa 10 menit.
                        Data tidak pernah menampilkan bot token atau initData
                        mentah.
                    </div>
                </div>
            </div>

            <div className="mt-auto text-center text-[11px] opacity-40">
                Mini App URL: https://melindo.polyflow.uk/telegram • Bot:
                @pico2004_bot
            </div>
        </div>
    );
}

export default function TelegramPage() {
    return (
        <TelegramProvider>
            <InnerPage />
        </TelegramProvider>
    );
}
