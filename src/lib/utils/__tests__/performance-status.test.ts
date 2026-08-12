import { describe, it, expect } from 'vitest';
import { getPerformanceStatusLevel } from '../performance-status';
import {
    PERFORMANCE_P95_WARN_MS,
    PERFORMANCE_P95_CRITICAL_MS,
} from '@/lib/constants/performance';

describe('getPerformanceStatusLevel', () => {
    it('returns unknown when there is no p95 sample', () => {
        // Arrange
        const p95Ms = null;

        // Act
        const level = getPerformanceStatusLevel(p95Ms);

        // Assert
        expect(level).toBe('unknown');
    });

    it('returns ok when p95 is well below the warn threshold', () => {
        // Arrange
        const p95Ms = 100;

        // Act
        const level = getPerformanceStatusLevel(p95Ms);

        // Assert
        expect(level).toBe('ok');
    });

    it('returns ok when p95 is just below the warn threshold', () => {
        // Arrange
        const p95Ms = PERFORMANCE_P95_WARN_MS - 1;

        // Act
        const level = getPerformanceStatusLevel(p95Ms);

        // Assert
        expect(level).toBe('ok');
    });

    it('returns warn when p95 is exactly at the warn threshold', () => {
        // Arrange
        const p95Ms = PERFORMANCE_P95_WARN_MS;

        // Act
        const level = getPerformanceStatusLevel(p95Ms);

        // Assert
        expect(level).toBe('warn');
    });

    it('returns warn when p95 is just below the critical threshold', () => {
        // Arrange
        const p95Ms = PERFORMANCE_P95_CRITICAL_MS - 1;

        // Act
        const level = getPerformanceStatusLevel(p95Ms);

        // Assert
        expect(level).toBe('warn');
    });

    it('returns critical when p95 is exactly at the critical threshold', () => {
        // Arrange
        const p95Ms = PERFORMANCE_P95_CRITICAL_MS;

        // Act
        const level = getPerformanceStatusLevel(p95Ms);

        // Assert
        expect(level).toBe('critical');
    });

    it('returns critical when p95 is far above the critical threshold', () => {
        // Arrange
        const p95Ms = PERFORMANCE_P95_CRITICAL_MS * 10;

        // Act
        const level = getPerformanceStatusLevel(p95Ms);

        // Assert
        expect(level).toBe('critical');
    });
});
