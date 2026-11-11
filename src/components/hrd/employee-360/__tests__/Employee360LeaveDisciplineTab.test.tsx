// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { Employee360LeaveDisciplineTab } from '../Employee360LeaveDisciplineTab';
import {
    listDisciplinaryActions,
    listLeaveRequests,
} from '@/actions/hrd/disciplinary-leave';

vi.mock('@/actions/hrd/disciplinary-leave', () => ({
    listDisciplinaryActions: vi.fn(),
    listLeaveRequests: vi.fn(),
}));

function discipline(id: string, reason: string, documentUrl: string) {
    return {
        id,
        type: 'SP1',
        reason,
        effectiveDate: '2026-05-04T00:00:00Z',
        expiryDate: null,
        documentUrl,
    };
}

describe('Employee360LeaveDisciplineTab document links', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.mocked(listLeaveRequests).mockResolvedValue({
            success: true,
            data: [],
        } as never);
        vi.mocked(listDisciplinaryActions).mockResolvedValue({
            success: true,
            data: [
                discipline('d1', 'Alasan aman', '/api/images/hrd/doc-1.pdf'),
                discipline('d2', 'Alasan js', 'javascript:alert(1)'),
                discipline('d3', 'Alasan http', 'http://example.com/x.pdf'),
            ],
        } as never);
    });

    it('renders a link only for safe urls and a plain notice otherwise', async () => {
        const { container } = render(
            <Employee360LeaveDisciplineTab employeeId="e-1" />,
        );
        await waitFor(() => expect(screen.getByText('Alasan aman')).toBeTruthy());

        const hrefs = Array.from(container.querySelectorAll('a')).map((a) =>
            a.getAttribute('href'),
        );
        expect(hrefs).toEqual(['/api/images/hrd/doc-1.pdf']);
        expect(screen.getAllByText('Tautan tidak valid')).toHaveLength(2);
    });
});
