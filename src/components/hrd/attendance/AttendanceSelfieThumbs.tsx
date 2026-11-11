'use client';

import type {
    AttendanceRecord,
    PhotoPreview,
} from './attendance-recap-types';

const THUMB_CLASS =
    'h-9 w-9 rounded-md overflow-hidden border border-border hover:ring-2 hover:ring-primary/40';

interface Props {
    record: AttendanceRecord;
    onPreview: (preview: PhotoPreview) => void;
}

/** Thumbnail selfie masuk (bila valid) dan pulang pada satu baris rekap. */
export function AttendanceSelfieThumbs({ record: r, onPreview }: Props) {
    const clockInUrl = r.clockInPhotoUrl;
    const clockOutUrl = r.clockOutPhotoUrl;
    return (
        <div className="flex items-center gap-1">
            {clockInUrl && r.hasValidSelfie !== false ? (
                <button
                    type="button"
                    className={THUMB_CLASS}
                    onClick={() =>
                        onPreview({
                            url: clockInUrl,
                            title: `${r.employeeName} — Masuk`,
                        })
                    }
                    title="Selfie masuk"
                    aria-label={`Lihat selfie masuk ${r.employeeName}`}
                >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={clockInUrl}
                        alt={`Selfie masuk ${r.employeeName}`}
                        className="h-full w-full object-cover"
                    />
                </button>
            ) : (
                <span className="text-muted-foreground text-xs">-</span>
            )}
            {clockOutUrl && (
                <button
                    type="button"
                    className={`${THUMB_CLASS} opacity-90`}
                    onClick={() =>
                        onPreview({
                            url: clockOutUrl,
                            title: `${r.employeeName} — Pulang`,
                        })
                    }
                    title="Selfie pulang"
                    aria-label={`Lihat selfie pulang ${r.employeeName}`}
                >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={clockOutUrl}
                        alt={`Selfie pulang ${r.employeeName}`}
                        className="h-full w-full object-cover"
                    />
                </button>
            )}
        </div>
    );
}
