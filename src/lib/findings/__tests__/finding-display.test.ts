import { describe, expect, it } from 'vitest';
import { DETECTOR_RESOURCES } from '../detector-catalog';
import {
    describeAgeSpan,
    describeFirstSeen,
    describeSla,
    describeSnooze,
    detectorLabel,
} from '../finding-display';

const NOW = new Date('2026-11-08T12:00:00.000Z');

describe('detectorLabel', () => {
    it('has an Indonesian label for every catalogued detector', () => {
        for (const detector of Object.keys(DETECTOR_RESOURCES)) {
            expect(detectorLabel(detector)).not.toBe(detector);
        }
    });

    it('falls back to the raw key for an unknown detector', () => {
        expect(detectorLabel('future_detector')).toBe('future_detector');
        expect(detectorLabel('toString')).toBe('toString');
    });
});

describe('describeSla', () => {
    it('marks baseline findings as having no SLA', () => {
        expect(describeSla(null, NOW)).toEqual({
            tone: 'none',
            text: 'Tanpa SLA (tunggakan lama)',
        });
    });

    it('counts hours down while the SLA runs', () => {
        expect(describeSla('2026-11-08T17:00:00.000Z', NOW)).toEqual({
            tone: 'ok',
            text: 'SLA sisa 5 jam',
        });
    });

    it('switches to days beyond two days', () => {
        expect(describeSla('2026-11-12T12:00:00.000Z', NOW).text).toBe(
            'SLA sisa 4 hari',
        );
    });

    it('reports how late an overdue SLA is', () => {
        expect(describeSla('2026-11-08T06:00:00.000Z', NOW)).toEqual({
            tone: 'overdue',
            text: 'Lewat SLA 6 jam',
        });
    });

    it('tolerates an unparseable date', () => {
        expect(describeSla('bukan tanggal', NOW).tone).toBe('none');
    });
});

describe('describeFirstSeen', () => {
    it('describes recent and old detections', () => {
        expect(describeFirstSeen('2026-11-08T11:45:00.000Z', NOW)).toBe(
            'Terdeteksi baru saja',
        );
        expect(describeFirstSeen('2026-11-08T07:00:00.000Z', NOW)).toBe(
            'Terdeteksi 5 jam lalu',
        );
        expect(describeFirstSeen('2026-11-01T12:00:00.000Z', NOW)).toBe(
            'Terdeteksi 7 hari lalu',
        );
    });
});

describe('describeAgeSpan', () => {
    it('returns a bare span without a sentence', () => {
        expect(describeAgeSpan('2026-11-01T12:00:00.000Z', NOW)).toBe('7 hari');
        expect(describeAgeSpan('2026-11-08T07:00:00.000Z', NOW)).toBe('5 jam');
        expect(describeAgeSpan('bukan tanggal', NOW)).toBe('');
    });
});

describe('describeSnooze', () => {
    it('shows the wake-up date', () => {
        expect(describeSnooze('2026-11-12T00:00:00.000Z')).toMatch(
            /^Ditunda sampai 12 Nov/,
        );
    });

    it('falls back to plain text without a date', () => {
        expect(describeSnooze(null)).toBe('Ditunda');
    });
});
