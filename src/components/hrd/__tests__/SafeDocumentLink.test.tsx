// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import React from 'react';
import { SafeDocumentLink } from '../SafeDocumentLink';

describe('SafeDocumentLink', () => {
    it.each(['/api/images/hrd/a.pdf', 'https://example.com/a.pdf'])(
        'renders %s as a link',
        (url) => {
            render(<SafeDocumentLink url={url}>Buka</SafeDocumentLink>);
            expect(screen.getByText('Buka').getAttribute('href')).toBe(url);
        },
    );

    it.each(['javascript:alert(1)', 'http://example.com/a.pdf', 'data:text/html,x'])(
        'renders %s as plain text without href',
        (url) => {
            const { container } = render(
                <SafeDocumentLink url={url}>Buka</SafeDocumentLink>,
            );
            expect(container.querySelector('a')).toBeNull();
            expect(screen.getByText('Tautan tidak valid')).toBeTruthy();
            expect(screen.queryByText('Buka')).toBeNull();
        },
    );
});
