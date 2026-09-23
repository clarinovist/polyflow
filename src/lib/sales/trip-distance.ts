import { z } from 'zod';
import { BusinessRuleError } from '@/lib/errors/errors';

const address = z.string().trim().min(1, 'Alamat wajib diisi').max(500).transform((v) => v.replace(/\s+/g, ' '));
const km = z.number().finite().min(0).max(99999999.99).refine(
    (value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001,
    'Gunakan maksimal dua angka desimal',
);
export const routeDistanceSchema = z.object({
    originAddress: address,
    destinationAddress: address,
    distanceKm: km.positive('Jarak harus lebih dari nol'),
}).refine((v) => v.originAddress.toLowerCase() !== v.destinationAddress.toLowerCase(), 'Alamat asal dan tujuan harus berbeda');
export const tripDistancePlanSchema = z.object({
    tripId: z.string().min(1),
    routeIds: z.array(z.string().min(1)).min(1, 'Pilih setidaknya satu ruas').max(50),
});
export const startMileageSchema = z.object({
    tripId: z.string().min(1),
    driverName: z.string().trim().min(1, 'Nama sopir wajib diisi').max(150),
    odometerStart: km,
});
export const finishMileageSchema = z.object({
    tripId: z.string().min(1),
    odometerEnd: km,
});
export interface DistanceLeg {
    routeId: string;
    originAddress: string;
    destinationAddress: string;
    distanceKm: number;
}
export function parseDistanceInput<T>(schema: z.ZodType<T>, raw: unknown): T {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) throw new BusinessRuleError(parsed.error.issues[0].message);
    return parsed.data;
}
export function totalRouteDistance(legs: DistanceLeg[]): number {
    if (!legs.length) throw new BusinessRuleError('Pilih setidaknya satu ruas');
    for (let i = 0; i < legs.length; i++) {
        parseDistanceInput(routeDistanceSchema, legs[i]);
        if (i > 0 && legs[i - 1].destinationAddress.trim().toLowerCase() !== legs[i].originAddress.trim().toLowerCase()) {
            throw new BusinessRuleError('Ruas harus tersambung sesuai urutan perjalanan. Tambahkan ruas pulang secara eksplisit.');
        }
    }
    const total = Math.round(legs.reduce((sum, leg) => sum + leg.distanceKm, 0) * 100) / 100;
    parseDistanceInput(km, total);
    return total;
}
export function actualTripDistance(start: number, end: number | null): number | null {
    parseDistanceInput(km, start);
    if (end === null) return null;
    parseDistanceInput(km, end);
    if (end < start) throw new BusinessRuleError('Odometer akhir tidak boleh lebih kecil dari awal.');
    return Math.round((end - start) * 100) / 100;
}
export function readDistanceLegs(value: unknown): DistanceLeg[] {
    const result = z.array(z.object({
        routeId: z.string(), originAddress: z.string(), destinationAddress: z.string(), distanceKm: z.number(),
    })).safeParse(value);
    return result.success ? result.data : [];
}
