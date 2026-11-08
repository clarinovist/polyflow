/**
 * "Versi desktop di HP" untuk ADMIN tenant. Gerbang mobile (auth.config.ts)
 * membaca cookie `bypass_mobile=true`; modul ini satu-satunya tempat yang
 * menulis, membaca, dan menghapusnya supaya durasi dan atribut konsisten.
 */
export const DESKTOP_VIEW_COOKIE = 'bypass_mobile';
export const DESKTOP_VIEW_DEFAULT_PATH = '/dashboard';
export const MOBILE_HOME_PATH = '/mobile';
const DESKTOP_VIEW_PREF_KEY = 'polyflow.desktopViewDays';
const SECONDS_PER_DAY = 86_400;

export const DESKTOP_VIEW_DURATIONS = [
    { days: 1, label: '24 jam' },
    { days: 7, label: '7 hari' },
    { days: 30, label: '30 hari' },
] as const;

export type DesktopViewDays = (typeof DESKTOP_VIEW_DURATIONS)[number]['days'];

export const DEFAULT_DESKTOP_VIEW_DAYS: DesktopViewDays = 1;

export function parseDesktopViewDays(raw: unknown): DesktopViewDays {
    const days = Number(raw);
    const match = DESKTOP_VIEW_DURATIONS.find((d) => d.days === days);
    return match ? match.days : DEFAULT_DESKTOP_VIEW_DAYS;
}

export function desktopViewLabel(days: DesktopViewDays): string {
    return (
        DESKTOP_VIEW_DURATIONS.find((d) => d.days === days)?.label ?? '24 jam'
    );
}

export function buildDesktopViewCookie(
    days: DesktopViewDays,
    secure: boolean,
): string {
    const parts = [
        `${DESKTOP_VIEW_COOKIE}=true`,
        'path=/',
        `max-age=${days * SECONDS_PER_DAY}`,
        'SameSite=Lax',
    ];
    if (secure) parts.push('Secure');
    return parts.join('; ');
}

export function buildDesktopViewClearCookie(secure: boolean): string {
    const parts = [
        `${DESKTOP_VIEW_COOKIE}=`,
        'path=/',
        'max-age=0',
        'SameSite=Lax',
    ];
    if (secure) parts.push('Secure');
    return parts.join('; ');
}

export function hasDesktopViewCookie(cookieString: string): boolean {
    return cookieString
        .split(';')
        .some((c) => c.trim() === `${DESKTOP_VIEW_COOKIE}=true`);
}

/** Hanya path internal; menolak URL absolut/protocol-relative (open redirect). */
export function safeDesktopTarget(target: string | null | undefined): string {
    if (!target || !target.startsWith('/') || target.startsWith('//')) {
        return DESKTOP_VIEW_DEFAULT_PATH;
    }
    return target;
}

function isSecureContext(): boolean {
    return typeof location !== 'undefined' && location.protocol === 'https:';
}

export function getPreferredDesktopViewDays(): DesktopViewDays {
    try {
        return parseDesktopViewDays(
            window.localStorage.getItem(DESKTOP_VIEW_PREF_KEY),
        );
    } catch {
        return DEFAULT_DESKTOP_VIEW_DAYS;
    }
}

export function setPreferredDesktopViewDays(days: DesktopViewDays): void {
    try {
        window.localStorage.setItem(DESKTOP_VIEW_PREF_KEY, String(days));
    } catch {
        // Penyimpanan diblokir (mode privat): pilihan hanya berlaku sekali.
    }
}

export function isDesktopViewActive(): boolean {
    return (
        typeof document !== 'undefined' && hasDesktopViewCookie(document.cookie)
    );
}

/**
 * Aktifkan lalu muat ulang penuh: middleware harus mengevaluasi cookie baru;
 * router.push() bisa memakai Router Cache dan melewatkan pemeriksaan itu.
 */
export function enableDesktopView(
    days: DesktopViewDays,
    target?: string | null,
): void {
    document.cookie = buildDesktopViewCookie(days, isSecureContext());
    window.location.assign(safeDesktopTarget(target));
}

export function disableDesktopView(): void {
    document.cookie = buildDesktopViewClearCookie(isSecureContext());
    // Muat ulang penuh disengaja agar middleware membaca cookie yang sudah dihapus.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(MOBILE_HOME_PATH);
}
