import { describe, expect, it } from 'vitest';
import { buildDotMatrixPrintCss } from '../dot-matrix-print-css';

const PAPER = { widthCm: 24.13, heightCm: 13.97, marginMm: 5 };

/** Returns the body of the first `@media print { ... }` block. */
function printBlock(css: string): string {
    const start = css.indexOf('@media print');
    expect(start).toBeGreaterThanOrEqual(0);
    return css.slice(start);
}

/** Returns the declarations of the first rule whose selector matches. */
function ruleBody(css: string, selector: string): string {
    const index = css.indexOf(selector);
    expect(index, `selector ${selector} not found`).toBeGreaterThanOrEqual(0);
    const open = css.indexOf('{', index);
    const close = css.indexOf('}', open);
    return css.slice(open + 1, close);
}

describe('buildDotMatrixPrintCss', () => {
    it('declares @page size and margin from the paper size', () => {
        const css = buildDotMatrixPrintCss(PAPER);

        expect(css).toContain('size: 24.13cm 13.97cm;');
        expect(css).toContain('margin: 5mm;');
    });

    it('does not force the page height or padding on .print-page when printing', () => {
        const print = printBlock(buildDotMatrixPrintCss(PAPER));
        const body = ruleBody(print, '.print-page {');

        expect(body).toMatch(/min-height:\s*0\s*!important/);
        expect(body).toMatch(/padding:\s*0\s*!important/);
        expect(body).toMatch(/margin:\s*0\s*!important/);
        expect(body).toMatch(/width:\s*auto\s*!important/);
        expect(body).toMatch(/max-width:\s*none\s*!important/);
        expect(print).not.toContain('13.97cm');
        expect(print).not.toContain('24.13cm');
    });

    it('does not lock html/body height or overflow when printing', () => {
        const print = printBlock(buildDotMatrixPrintCss(PAPER));
        const body = ruleBody(print, 'html, body {');

        expect(body).toMatch(/min-height:\s*0\s*!important/);
        expect(body).toMatch(/height:\s*auto\s*!important/);
        expect(body).toMatch(/overflow:\s*visible\s*!important/);
    });

    it('repeats the table header and keeps rows together across pages', () => {
        const print = printBlock(buildDotMatrixPrintCss(PAPER));

        expect(ruleBody(print, '.print-page thead')).toContain(
            'display: table-header-group',
        );
        const rowRule = ruleBody(print, '.print-page tr');
        expect(rowRule).toContain('break-inside: avoid');
        expect(rowRule).toContain('page-break-inside: avoid');
    });

    it('lets long invoices continue onto the next page', () => {
        const print = printBlock(buildDotMatrixPrintCss(PAPER));
        const pageRule = ruleBody(print, '.print-page {');

        expect(pageRule).not.toContain('break-inside');
        expect(pageRule).not.toContain('page-break-inside');
    });

    it('hides .no-print elements', () => {
        const print = printBlock(buildDotMatrixPrintCss(PAPER));

        expect(ruleBody(print, '.no-print')).toContain('display: none');
    });

    it('follows a different paper size without leaking the default', () => {
        const css = buildDotMatrixPrintCss({
            widthCm: 21,
            heightCm: 29.7,
            marginMm: 8,
        });

        expect(css).toContain('size: 21cm 29.7cm;');
        expect(css).toContain('margin: 8mm;');
        expect(css).not.toContain('24.13');
    });
});
