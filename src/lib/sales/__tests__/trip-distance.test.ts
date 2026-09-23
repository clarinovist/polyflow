import { describe, expect, it } from 'vitest';
import { actualTripDistance, parseDistanceInput, readDistanceLegs, routeDistanceSchema, startMileageSchema, totalRouteDistance } from '../trip-distance';
const leg = (from: string, to: string, distanceKm: number) => ({ routeId: `${from}-${to}`, originAddress: from, destinationAddress: to, distanceKm });
describe('trip road distance', () => {
    it('sums ordered legs, not per-DO round trips; return must be explicit', () => {
        expect(totalRouteDistance([leg('Factory', 'A', 40), leg('A', 'B', 20), leg('B', 'Factory', 50)])).toBe(110);
        expect(totalRouteDistance([leg('Factory', 'A', 40)])).toBe(40);
        expect(totalRouteDistance([leg('A', 'B', 0.1), leg('B', 'A', 0.2)])).toBe(0.3);
    });
    it('rejects disconnected and empty routes', () => {
        expect(() => totalRouteDistance([])).toThrow('ruas');
        expect(() => totalRouteDistance([leg('F', 'A', 40), leg('F', 'B', 30)])).toThrow('tersambung');
    });
    it.each([NaN, Infinity, -1, 100000000, 1.001])('rejects invalid numeric input %s', (n) => {
        expect(() => parseDistanceInput(startMileageSchema, { tripId: 't', driverName: 'D', odometerStart: n })).toThrow();
    });
    it('does not coerce empty/null into zero and normalizes addresses', () => {
        expect(() => parseDistanceInput(startMileageSchema, { tripId: 't', driverName: 'D', odometerStart: '' })).toThrow();
        expect(() => parseDistanceInput(startMileageSchema, { tripId: 't', driverName: 'D', odometerStart: null })).toThrow();
        expect(parseDistanceInput(routeDistanceSchema, { originAddress: ' Factory  A ', destinationAddress: 'Depot B', distanceKm: 10 }).originAddress).toBe('Factory A');
        expect(() => parseDistanceInput(routeDistanceSchema, { originAddress: 'A', destinationAddress: 'a', distanceKm: 10 })).toThrow();
    });
    it('separates unknown actual km from zero, rejects backwards readings', () => {
        expect(actualTripDistance(100, null)).toBeNull();
        expect(actualTripDistance(0, 0)).toBe(0);
        expect(actualTripDistance(100.1, 184.2)).toBe(84.1);
        expect(() => actualTripDistance(100, 99)).toThrow('lebih kecil');
        expect(readDistanceLegs(null)).toEqual([]);
        expect(readDistanceLegs([leg('A', 'B', 1)])).toHaveLength(1);
    });
});
