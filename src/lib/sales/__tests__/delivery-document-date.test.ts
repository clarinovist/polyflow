import { describe, expect, it } from 'vitest';
import {
    DELIVERY_DOCUMENT_LEAD_BUSINESS_DAYS,
    isDeliveryDocumentDateAllowed,
    maxDeliveryDocumentDate,
} from '../delivery-document-date';

/** 10:00 WIB pada tanggal bisnis tertentu. */
const wibMorning = (dateStr: string) => new Date(`${dateStr}T03:00:00.000Z`);

describe('delivery document date horizon', () => {
    it('allows exactly one calendar day ahead on a midweek day', () => {
        expect(DELIVERY_DOCUMENT_LEAD_BUSINESS_DAYS).toBe(1);
        expect(maxDeliveryDocumentDate(wibMorning('2026-11-04'))).toBe(
            '2026-11-05',
        );
    });

    it('skips Sunday so a Saturday document can be dated Monday', () => {
        expect(maxDeliveryDocumentDate(wibMorning('2026-11-07'))).toBe(
            '2026-11-09',
        );
    });

    it('keeps Monday as the limit when today is Sunday', () => {
        expect(maxDeliveryDocumentDate(wibMorning('2026-11-08'))).toBe(
            '2026-11-09',
        );
    });

    it('computes the horizon from the WIB business day, not UTC', () => {
        // 23:30 WIB 4 Nov is still 16:30 UTC 4 Nov → limit 5 Nov.
        expect(
            maxDeliveryDocumentDate(new Date('2026-11-04T16:30:00.000Z')),
        ).toBe('2026-11-05');
        // 00:30 WIB 5 Nov is already 17:30 UTC 4 Nov → limit 6 Nov.
        expect(
            maxDeliveryDocumentDate(new Date('2026-11-04T17:30:00.000Z')),
        ).toBe('2026-11-06');
    });

    it('accepts backdates, today and tomorrow, and rejects two days ahead', () => {
        const now = wibMorning('2026-11-04');
        expect(isDeliveryDocumentDateAllowed('2026-09-30', now)).toBe(true);
        expect(isDeliveryDocumentDateAllowed('2026-11-04', now)).toBe(true);
        expect(isDeliveryDocumentDateAllowed('2026-11-05', now)).toBe(true);
        expect(isDeliveryDocumentDateAllowed('2026-11-06', now)).toBe(false);
    });
});
