import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, UserRound } from 'lucide-react';
import { redirect } from 'next/navigation';
import { MobileAccountMenuServer } from '@/components/layout/mobile-account-menu-server';
import { MobilePortalHeader, MobilePortalShell } from '@/components/mobile';
import { ProfileSettings } from '@/components/settings/ProfileSettings';
import { resolveMobileAccountAccess } from '@/lib/mobile/mobile-account-access';

export const metadata: Metadata = {
    title: 'Akun Saya | PolyFlow',
};

export default async function MobileAccountPage() {
    const access = await resolveMobileAccountAccess();

    if (access.status === 'no-session') redirect('/login');
    if (access.status === 'desktop-only') {
        redirect('/device/desktop-required');
    }

    const errorMessage =
        access.status === 'tenant-context'
            ? 'Konteks perusahaan tidak tersedia. Muat ulang atau login kembali dari alamat perusahaan Anda.'
            : access.status === 'user-not-found'
              ? 'Akun tidak ditemukan di perusahaan aktif. Silakan login kembali atau hubungi admin.'
              : access.status === 'account-inactive'
                ? 'Akun Anda tidak aktif di perusahaan ini. Hubungi admin perusahaan untuk memeriksa akses.'
                : null;
    const allowedAccess = access.status === 'allowed' ? access : null;

    return (
        <MobilePortalShell
            contentId="mobile-account-content"
            showConnectivity={false}
            header={
                <MobilePortalHeader
                    title="Akun Saya"
                    icon={
                        <UserRound
                            aria-hidden="true"
                            className="h-5 w-5 text-blue-600 dark:text-blue-400"
                        />
                    }
                    actions={
                        <MobileAccountMenuServer
                            user={access.menuUser}
                            hideAccountLink
                        />
                    }
                />
            }
            bottomNavigation={null}
            className="pb-[env(safe-area-inset-bottom)]"
            mainClassName="mx-auto w-full max-w-2xl space-y-4 pb-8"
        >
            <Link
                href="/mobile?choose=1"
                className="inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                <ArrowLeft aria-hidden="true" className="h-4 w-4" />
                Pilih Portal
            </Link>

            {errorMessage ? (
                <section
                    role="alert"
                    className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
                >
                    <h1 className="font-semibold">Akun belum dapat dimuat</h1>
                    <p className="mt-1 leading-relaxed">{errorMessage}</p>
                </section>
            ) : allowedAccess ? (
                <>
                    <h1 className="sr-only">Akun Saya</h1>
                    <ProfileSettings
                        userName={allowedAccess.profile.name ?? undefined}
                        userEmail={allowedAccess.profile.email}
                        userLocale={allowedAccess.profile.locale}
                        userAvatarUrl={allowedAccess.profile.avatarUrl}
                        authMode={allowedAccess.profile.authMode}
                    />
                </>
            ) : null}
        </MobilePortalShell>
    );
}
