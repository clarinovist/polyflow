// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { Employee360DocumentsTab } from '../Employee360DocumentsTab';
import { listEmployeeDocuments } from '@/actions/hrd/employee-document';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/actions/hrd/employee-document', () => ({
    listEmployeeDocuments: vi.fn(),
    createEmployeeDocument: vi.fn(),
    archiveEmployeeDocument: vi.fn(),
    restoreEmployeeDocument: vi.fn(),
}));

const doc = (id: string, name: string, fileUrl: string) => ({
    id,
    category: 'KTP',
    name,
    fileUrl,
    status: 'ACTIVE',
    createdAt: '2026-05-04T00:00:00Z',
});

describe('Employee360DocumentsTab links', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.mocked(listEmployeeDocuments).mockResolvedValue({
            success: true,
            data: [
                doc('1', 'Dok aman', '/api/images/hrd/a.pdf'),
                doc('2', 'Dok https', 'https://example.com/a.pdf'),
                doc('3', 'Dok js', 'javascript:alert(1)'),
                doc('4', 'Dok http', 'http://example.com/a.pdf'),
            ],
        } as never);
    });

    it('links only safe urls', async () => {
        const { container } = render(<Employee360DocumentsTab employeeId="e-1" />);
        await waitFor(() => expect(screen.getByText('Dok aman')).toBeTruthy());

        const hrefs = Array.from(container.querySelectorAll('a')).map((a) =>
            a.getAttribute('href'),
        );
        expect(hrefs).toEqual(['/api/images/hrd/a.pdf', 'https://example.com/a.pdf']);
        expect(screen.getAllByText('Tautan tidak valid')).toHaveLength(2);
    });
});
