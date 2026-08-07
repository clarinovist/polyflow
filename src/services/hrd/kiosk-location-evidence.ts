import { z } from 'zod';

// Data lokasi datang dari browser lewat action publik kiosk — tipe TypeScript
// di signature bukan jaminan runtime, jadi divalidasi ulang di boundary ini.
//
// Fungsi ini sengaja TIDAK ditaruh di `src/actions/admin/attendance.ts`.
// File itu diawali `'use server'`, dan Next.js mensyaratkan SEMUA fungsi
// yang di-export dari file `'use server'` berupa async (server action).
// Validasi murni seperti ini tidak butuh async — memaksakannya jadi async
// hanya untuk lolos constraint Next.js menambah `await` semu di setiap
// pemanggil tanpa manfaat nyata. Modul non-`'use server'` membiarkan ini
// tetap sinkron dan diuji tanpa ceremony async.

export type KioskLocationEvidenceInput = {
    latitude: number;
    longitude: number;
    accuracy: number;
};

const kioskLocationEvidenceSchema = z.object({
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
    accuracy: z.number().finite().positive(),
});

export type LocationEvidenceParseResult =
    | { success: true; data: KioskLocationEvidenceInput | undefined }
    | { success: false; error: string };

/** Boundary validation for `locationEvidence` sent from the kiosk browser. */
export function parseKioskLocationEvidence(
    locationEvidence: unknown,
): LocationEvidenceParseResult {
    if (locationEvidence === undefined || locationEvidence === null) {
        return { success: true, data: undefined };
    }
    const parsed = kioskLocationEvidenceSchema.safeParse(locationEvidence);
    if (!parsed.success) {
        return {
            success: false,
            error: 'Data lokasi GPS tidak valid. Coba lagi atau muat ulang halaman.',
        };
    }
    return { success: true, data: parsed.data };
}
