import { describe, expect, it } from 'vitest';
import { filterKioskJobs } from '../kiosk-job-filter';

const job = (id: string, orderNumber: string, productName: string, machineId: string | null) => ({
    id,
    orderNumber,
    productName,
    machine: machineId ? { id: machineId, name: machineId } : null,
});

const jobs = [
    job('a', 'WO-001', 'Tali Rafia 1 kg', 'm-1'),
    job('b', 'WO-002', 'Tali Rafia Polos 5 kg', 'm-2'),
    job('c', 'WO-003', 'Baling manual', null),
];

const ids = (list: { id: string }[]) => list.map((item) => item.id);

describe('filterKioskJobs', () => {
    it('keeps manual SPKs for an operator whose machines are assigned', () => {
        expect(ids(filterKioskJobs(jobs, { query: '', machine: 'all', operatorMachineIds: ['m-1'] }))).toEqual(['a', 'c']);
    });

    it('filters one machine or only SPKs without a machine', () => {
        expect(ids(filterKioskJobs(jobs, { query: '', machine: 'm-2', operatorMachineIds: [] }))).toEqual(['b']);
        expect(ids(filterKioskJobs(jobs, { query: '', machine: 'manual', operatorMachineIds: [] }))).toEqual(['c']);
    });

    it('searches the SPK number and the product name, ignoring case', () => {
        expect(ids(filterKioskJobs(jobs, { query: 'wo-002', machine: 'all', operatorMachineIds: [] }))).toEqual(['b']);
        expect(ids(filterKioskJobs(jobs, { query: ' polos ', machine: 'all', operatorMachineIds: [] }))).toEqual(['b']);
    });
});
