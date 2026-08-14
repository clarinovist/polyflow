export function isInQuietHours(
    pref: {
        quietHoursStart: number | null;
        quietHoursEnd: number | null;
    } | null,
    timezone: string,
    now: Date = new Date(),
): boolean {
    if (pref?.quietHoursStart == null || pref?.quietHoursEnd == null)
        return false;

    const hour = Number(
        now.toLocaleString('en-US', {
            hour: 'numeric',
            hour12: false,
            timeZone: timezone,
        }),
    );

    const start = pref.quietHoursStart;
    const end = pref.quietHoursEnd;

    if (start <= end) {
        return hour >= start && hour < end;
    }
    // overnight window (e.g. 22 → 6)
    return hour >= start || hour < end;
}
