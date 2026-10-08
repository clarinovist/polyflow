// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { WorkflowSummaryGrid } from '../WorkflowSummaryGrid';

afterEach(cleanup);

describe('WorkflowSummaryGrid', () => {
    it('renders a named summary region with ordered items', () => {
        render(
            <WorkflowSummaryGrid
                label="Ringkasan contoh"
                items={[
                    {
                        label: 'Status',
                        icon: <span aria-hidden="true">•</span>,
                        value: 'Aktif',
                        detail: 'Siap dilanjutkan',
                    },
                    {
                        label: 'Dokumen',
                        icon: <span aria-hidden="true">•</span>,
                        value: '2 berkas',
                    },
                ]}
            />,
        );

        const region = screen.getByRole('region', {
            name: 'Ringkasan contoh',
        });
        expect(region.textContent).toContain('Status');
        expect(region.textContent).toContain('Aktif');
        expect(region.textContent).toContain('Siap dilanjutkan');
        expect(region.textContent).toContain('Dokumen');
        expect(region.textContent).toContain('2 berkas');
    });
});
