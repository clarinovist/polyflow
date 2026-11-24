export interface DotMatrixPaperSize {
    widthCm: number;
    heightCm: number;
    marginMm: number;
}

/**
 * Print CSS shared by the dot-matrix documents (invoice, delivery note).
 *
 * The physical margin comes only from `@page`; `.print-page` therefore has no
 * padding, no forced width and no paper-high `min-height`. Any of those added
 * on top of the `@page` margin makes the page taller than the printable area
 * and Chrome emits blank pages.
 *
 * Every override uses `!important` because the component's screen stylesheet
 * (same specificity, defined in the same document) would otherwise win in
 * print as well.
 *
 * Long documents may continue on the next page: the table header repeats and
 * a row is never split across pages.
 */
export function buildDotMatrixPrintCss(paperSize: DotMatrixPaperSize): string {
    const { widthCm, heightCm, marginMm } = paperSize;

    return `
@page {
  size: ${widthCm}cm ${heightCm}cm;
  margin: ${marginMm}mm;
}

@media print {
  .no-print {
    display: none !important;
  }
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    width: auto !important;
    min-height: 0 !important;
    height: auto !important;
    overflow: visible !important;
    background: #fff !important;
  }
  .print-page {
    width: auto !important;
    max-width: none !important;
    min-height: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    box-sizing: border-box;
  }
  .print-page thead {
    display: table-header-group;
  }
  .print-page tr {
    break-inside: avoid;
    page-break-inside: avoid;
  }
}
`;
}
