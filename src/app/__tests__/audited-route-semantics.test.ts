// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

const parse = (relativePath: string) => {
    const fileName = path.join(ROOT, relativePath);
    const sourceFile = ts.createSourceFile(
        fileName,
        fs.readFileSync(fileName, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
    );

    const diagnostics = (
        sourceFile as ts.SourceFile & {
            parseDiagnostics?: readonly ts.Diagnostic[];
        }
    ).parseDiagnostics;
    expect(diagnostics ?? [], `${relativePath} must parse`).toEqual([]);
    return sourceFile;
};

type JsxElementOpening = ts.JsxOpeningElement | ts.JsxSelfClosingElement;

const jsxOpenings = (sourceFile: ts.SourceFile, tagName: string) => {
    const matches: JsxElementOpening[] = [];

    const visit = (node: ts.Node) => {
        if (
            (ts.isJsxOpeningElement(node) ||
                ts.isJsxSelfClosingElement(node)) &&
            node.tagName.getText(sourceFile) === tagName
        ) {
            matches.push(node);
        }
        ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return matches;
};

const jsxElements = (sourceFile: ts.SourceFile, tagName: string) => {
    const matches: ts.JsxElement[] = [];

    const visit = (node: ts.Node) => {
        if (
            ts.isJsxElement(node) &&
            node.openingElement.tagName.getText(sourceFile) === tagName
        ) {
            matches.push(node);
        }
        ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return matches;
};

const attribute = (opening: JsxElementOpening, name: string) =>
    opening.attributes.properties.find(
        (property): property is ts.JsxAttribute =>
            ts.isJsxAttribute(property) && property.name.getText() === name,
    );

const stringAttributeValue = (
    opening: JsxElementOpening,
    name: string,
): string | undefined => {
    const initializer = attribute(opening, name)?.initializer;
    return initializer && ts.isStringLiteral(initializer)
        ? initializer.text
        : undefined;
};

const explicitHeadingPages = [
    'src/app/dashboard/machines/page.tsx',
    'src/app/dashboard/products/create/page.tsx',
    'src/app/error/page.tsx',
    'src/app/finance/budgeting/input/page.tsx',
    'src/app/finance/coa/page.tsx',
    'src/app/finance/journals/page.tsx',
    'src/app/finance/periods/page.tsx',
    'src/app/maklon/returns/create/page.tsx',
    'src/app/purchasing/requests/page.tsx',
    'src/app/purchasing/returns/create/page.tsx',
    'src/app/sales/orders/create/page.tsx',
    'src/app/sales/returns/create/page.tsx',
];

const printReportPages = [
    'src/app/finance/petty-cash/reports/cash-opname/page.tsx',
    'src/app/finance/petty-cash/reports/daily/page.tsx',
    'src/app/finance/petty-cash/reports/rekap/page.tsx',
];

const captionedTables = [
    'src/app/dashboard/machines/page.tsx',
    'src/app/finance/petty-cash/reports/daily/page.tsx',
    'src/components/finance/budget/BudgetListClient.tsx',
    'src/components/finance/coa/AccountListClient.tsx',
    'src/components/finance/journals/JournalListClient.tsx',
    'src/components/production/bom/BOMForm.tsx',
];

describe('audited route semantics', () => {
    it.each([...explicitHeadingPages, ...printReportPages])(
        '%s owns exactly one explicit H1',
        (file) => {
            expect(jsxOpenings(parse(file), 'h1')).toHaveLength(1);
        },
    );

    it('composes /kiosk/jobs with one useful visible H1', () => {
        const routeFiles = [
            'src/app/kiosk/jobs/page.tsx',
            'src/app/kiosk/jobs/KioskJobList.tsx',
        ];
        const headings = routeFiles.flatMap((file) => {
            const sourceFile = parse(file);
            return jsxElements(sourceFile, 'h1').map((element) => ({
                element,
                sourceFile,
            }));
        });

        expect(headings).toHaveLength(1);
        expect(
            stringAttributeValue(
                headings[0].element.openingElement,
                'className',
            )
                ?.split(/\s+/)
                .includes('sr-only'),
        ).not.toBe(true);
        expect(
            headings[0].element.getText(headings[0].sourceFile),
        ).toContain('kioskLabels.jobList');
    });

    it.each(captionedTables)(
        '%s gives every table one visually hidden caption',
        (file) => {
            const sourceFile = parse(file);
            const tables = jsxElements(sourceFile, 'Table');

            expect(tables).not.toHaveLength(0);
            for (const table of tables) {
                const captions = table.children
                    .filter(ts.isJsxElement)
                    .map((child) => child.openingElement)
                    .filter(
                        (opening) =>
                            opening.tagName.getText(sourceFile) ===
                            'TableCaption',
                    );

                expect(captions).toHaveLength(1);
                expect(
                    stringAttributeValue(captions[0], 'className')
                        ?.split(/\s+/)
                        .includes('sr-only'),
                ).toBe(true);
            }
        },
    );

    it('keeps workspace chrome subordinate to route page headings', () => {
        expect(jsxOpenings(parse('src/app/production/layout.tsx'), 'h1')).toHaveLength(
            0,
        );
        expect(jsxOpenings(parse('src/app/warehouse/layout.tsx'), 'h1')).toHaveLength(
            0,
        );
    });

    it('gives the breadcrumb home link an accessible Indonesian name', () => {
        const sourceFile = parse('src/components/layout/path-breadcrumb.tsx');
        const homeLink = jsxOpenings(sourceFile, 'Link').find(
            (link) => stringAttributeValue(link, 'aria-label') === 'Beranda',
        );
        const decorativeHomeIcons = jsxOpenings(sourceFile, 'Home').filter(
            (icon) => stringAttributeValue(icon, 'aria-hidden') === 'true',
        );

        expect(homeLink).toBeDefined();
        expect(decorativeHomeIcons).toHaveLength(1);
    });
});
