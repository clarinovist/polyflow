// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PrintPreviewModal } from '../print-preview-modal';

function printCss(): string {
    const styles = Array.from(document.querySelectorAll('style'));
    return styles.map((style) => style.textContent ?? '').join('\n');
}

function renderModal(open: boolean) {
    return render(
        <PrintPreviewModal open={open} onOpenChange={vi.fn()} title="Pratinjau">
            <div>isi dokumen</div>
        </PrintPreviewModal>,
    );
}

describe('PrintPreviewModal print layout', () => {
    it('removes everything outside the dialog with display:none instead of visibility:hidden', () => {
        renderModal(true);

        const css = printCss();
        expect(css).toContain(
            'body > *:not(:has([data-print-preview-root]))',
        );
        expect(css).toMatch(/display:\s*none\s*!important/);
        expect(css).not.toContain('visibility');
    });

    it('makes the dialog static so Chrome does not repeat it on every page', () => {
        renderModal(true);

        const css = printCss();
        expect(css).toMatch(/position:\s*static\s*!important/);
        expect(css).toMatch(/translate:\s*none\s*!important/);
        expect(css).toMatch(/transform:\s*none\s*!important/);
    });

    it('lifts the Radix scroll lock on html and body', () => {
        renderModal(true);

        const css = printCss();
        expect(css).toContain('body[data-scroll-locked]');
        expect(css).toMatch(/overflow:\s*visible\s*!important/);
        expect(css).toMatch(/height:\s*auto\s*!important/);
    });

    it('does not inject print rules while the modal is closed', () => {
        renderModal(false);

        expect(printCss()).not.toContain('data-print-preview-root');
    });

    it('renders the document inside the print root', () => {
        renderModal(true);

        const root = document.querySelector('[data-print-preview-root]');
        expect(root?.textContent).toContain('isi dokumen');
    });
});
