// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import type { Employee } from '@prisma/client';
import { Employee360Header } from '../Employee360Header';

vi.mock('next/link', () => ({
    default: ({ children, href }: { children: React.ReactNode; href: string }) => (
        <a href={href}>{children}</a>
    ),
}));

function employee(overrides: Record<string, unknown>): Employee {
    return {
        id: 'e-1',
        name: 'Budi Contoh',
        code: 'EMP-001',
        role: 'OPERATOR',
        status: 'ACTIVE',
        payType: 'DAILY',
        employmentStatus: 'PERMANENT',
        probationEndDate: null,
        contractEndDate: null,
        ...overrides,
    } as unknown as Employee;
}

describe('Employee360Header urgency', () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-07-19T03:00:00Z'));
    });
    afterEach(() => vi.useRealTimers());

    it('shows an overdue contract as "Lewat N hari"', () => {
        render(
            <Employee360Header
                employee={employee({
                    employmentStatus: 'CONTRACT',
                    contractEndDate: new Date('2026-07-14T00:00:00Z'),
                })}
            />,
        );
        expect(screen.getByText(/Lewat 5 hari/)).toBeTruthy();
    });

    it('shows an overdue probation too', () => {
        render(
            <Employee360Header
                employee={employee({
                    employmentStatus: 'PROBATION',
                    probationEndDate: new Date('2026-07-18T00:00:00Z'),
                })}
            />,
        );
        expect(screen.getByText(/Lewat 1 hari/)).toBeTruthy();
    });

    it('shows an upcoming contract end with days remaining', () => {
        render(
            <Employee360Header
                employee={employee({
                    employmentStatus: 'CONTRACT',
                    contractEndDate: new Date('2026-07-29T00:00:00Z'),
                })}
            />,
        );
        expect(screen.getByText(/Kontrak.*10 hari/)).toBeTruthy();
    });

    it('shows nothing for a permanent employee', () => {
        render(<Employee360Header employee={employee({})} />);
        expect(screen.queryByText(/Lewat|Habis|H-/)).toBeNull();
    });
});
