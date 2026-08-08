import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { createHeadingIdSequencer } from '@/lib/support/toc';

function inlineFormat(text: string): React.ReactNode {
    const pattern =
        /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[([^\]]+)\]\(([^)]+)\))|(https?:\/\/[^\s]+)|(\/support\/[a-z0-9-]+)/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let key = 0;
    while ((match = pattern.exec(text)) !== null) {
        if (match.index > lastIndex) {
            parts.push(
                <span key={key++}>{text.slice(lastIndex, match.index)}</span>,
            );
        }
        if (match[1]) {
            const code = match[1].slice(1, -1);
            parts.push(
                <code
                    key={key++}
                    className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono"
                >
                    {code}
                </code>,
            );
        } else if (match[2]) {
            const bold = match[2].slice(2, -2);
            parts.push(
                <strong key={key++} className="font-semibold">
                    {bold}
                </strong>,
            );
        } else if (match[3]) {
            const label = match[4];
            const url = match[5];
            const isInternal = url.startsWith('/support/');
            parts.push(
                <a
                    key={key++}
                    href={url}
                    className="text-primary underline underline-offset-2 hover:text-primary/80"
                    {...(isInternal
                        ? {}
                        : { target: '_blank', rel: 'noopener noreferrer' })}
                >
                    {label}
                </a>,
            );
        } else if (match[6]) {
            parts.push(
                <a
                    key={key++}
                    href={match[6]}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline underline-offset-2"
                >
                    {match[6]}
                </a>,
            );
        } else if (match[7]) {
            parts.push(
                <Link
                    key={key++}
                    href={match[7]}
                    className="text-primary underline underline-offset-2"
                >
                    {match[7]}
                </Link>,
            );
        }
        lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) {
        parts.push(<span key={key++}>{text.slice(lastIndex)}</span>);
    }
    if (parts.length === 0) return text;
    return <>{parts}</>;
}

function flushList(
    listBuffer: { ordered: boolean; items: string[] } | null,
    elements: React.ReactNode[],
    keyPrefix: string,
) {
    if (!listBuffer) return;
    if (listBuffer.ordered) {
        elements.push(
            <ol
                key={`${keyPrefix}-ol-${elements.length}`}
                className="list-decimal ml-5 my-2 space-y-1"
            >
                {listBuffer.items.map((it, i) => (
                    <li key={i} className="text-sm leading-relaxed">
                        {inlineFormat(it)}
                    </li>
                ))}
            </ol>,
        );
    } else {
        elements.push(
            <ul
                key={`${keyPrefix}-ul-${elements.length}`}
                className="list-disc ml-5 my-2 space-y-1"
            >
                {listBuffer.items.map((it, i) => (
                    <li key={i} className="text-sm leading-relaxed">
                        {inlineFormat(it)}
                    </li>
                ))}
            </ul>,
        );
    }
}

// ── GFM tables ────────────────────────────────────────────────────────

/** Split "| a | b |" into ["a", "b"]. Outer pipes optional. */
function splitTableRow(line: string): string[] {
    return line
        .trim()
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((cell) => cell.trim());
}

/**
 * A separator row is what turns the line above it into a header — without one
 * a line containing pipes is just prose and must stay a paragraph.
 * Accepts `---`, `:---`, `---:`, `:---:` per cell.
 */
function isTableSeparator(line: string): boolean {
    const trimmed = line.trim();
    if (!trimmed.includes('-')) return false;
    if (!trimmed.includes('|')) return false;
    const cells = splitTableRow(trimmed);
    if (cells.length === 0) return false;
    return cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function isTableRow(line: string): boolean {
    return line.trim().startsWith('|');
}

function renderTable(
    headerCells: string[],
    bodyRows: string[][],
    key: string,
): React.ReactNode {
    const columnCount = headerCells.length;
    return (
        <div key={key} className="my-4 overflow-x-auto rounded-lg border">
            <table className="w-full text-sm border-collapse">
                <thead className="bg-muted/50">
                    <tr>
                        {headerCells.map((cell, i) => (
                            <th
                                key={i}
                                className="text-left font-semibold px-3 py-2 border-b align-top whitespace-nowrap"
                            >
                                {inlineFormat(cell)}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {bodyRows.map((row, r) => (
                        <tr key={r} className="border-b last:border-b-0">
                            {/* Markdown is lenient about cell counts: pad short
                                rows and drop overflow so a malformed row cannot
                                break the column grid. */}
                            {Array.from({ length: columnCount }, (_, c) => (
                                <td
                                    key={c}
                                    className="px-3 py-2 align-top leading-relaxed"
                                >
                                    {inlineFormat(row[c] ?? '')}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

/**
 * Render markdown-like article body into structured JSX.
 * Handles: ## headings, ### collapsible sections (content nested inside),
 * GFM tables, bold, inline code, links, ordered/unordered lists,
 * blockquotes, code blocks.
 */
export function ArticleBodyRenderer({ bodyMd }: { bodyMd: string }) {
    const lines = bodyMd.split('\n');
    const elements: React.ReactNode[] = [];
    // Same sequencer `extractHeadings` (src/lib/support/toc.ts) uses, so the
    // rendered <h2> id matches the TOC anchor for the same heading text —
    // both walk headings in document order and de-dupe the same way.
    const nextHeadingId = createHeadingIdSequencer();

    // When a ### section is open, blocks accumulate into its children instead
    // of the top level, so the collapsible actually contains its content.
    let section: {
        title: string;
        idx: number;
        children: React.ReactNode[];
    } | null = null;
    const sink = (): React.ReactNode[] =>
        section ? section.children : elements;

    let listBuffer: { ordered: boolean; items: string[] } | null = null;
    let inCodeBlock = false;
    let codeBlockLines: string[] = [];
    let codeBlockKey = 0;

    const flush = () => {
        const target = sink();
        flushList(listBuffer, target, `art-${target.length}`);
        listBuffer = null;
    };

    const closeSection = () => {
        if (!section) return;
        const current = section;
        section = null;
        elements.push(
            <details key={`h3-${current.idx}`} className="my-4 group" open>
                <summary className="flex items-center gap-2 cursor-pointer text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors select-none">
                    <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                    {inlineFormat(current.title)}
                </summary>
                <div className="mt-2 pl-6 border-l-2 border-border space-y-2">
                    {current.children}
                </div>
            </details>,
        );
    };

    for (let idx = 0; idx < lines.length; idx++) {
        const line = lines[idx];
        const trimmed = line.trim();

        // Code block toggle
        if (trimmed.startsWith('```')) {
            if (inCodeBlock) {
                sink().push(
                    <pre
                        key={`code-${codeBlockKey++}`}
                        className="bg-muted/60 rounded-lg p-4 my-3 overflow-x-auto text-xs font-mono leading-relaxed border"
                    >
                        <code>{codeBlockLines.join('\n')}</code>
                    </pre>,
                );
                codeBlockLines = [];
                inCodeBlock = false;
            } else {
                flush();
                inCodeBlock = true;
            }
            continue;
        }

        if (inCodeBlock) {
            codeBlockLines.push(line);
            continue;
        }

        // Empty line
        if (trimmed === '') {
            flush();
            continue;
        }

        // Table: only when the next line is a separator row.
        if (
            isTableRow(trimmed) &&
            idx + 1 < lines.length &&
            isTableSeparator(lines[idx + 1])
        ) {
            flush();
            const headerCells = splitTableRow(trimmed);
            const bodyRows: string[][] = [];
            let cursor = idx + 2;
            while (cursor < lines.length && isTableRow(lines[cursor])) {
                bodyRows.push(splitTableRow(lines[cursor]));
                cursor++;
            }
            sink().push(renderTable(headerCells, bodyRows, `table-${idx}`));
            idx = cursor - 1;
            continue;
        }

        // H2 heading — also ends any open ### section
        if (trimmed.startsWith('## ')) {
            flush();
            closeSection();
            const headingText = trimmed.slice(3).trim();
            elements.push(
                <h2
                    key={`h2-${idx}`}
                    id={nextHeadingId(headingText)}
                    className="text-lg font-bold mt-8 mb-3 pb-1.5 border-b border-border scroll-mt-24"
                >
                    {inlineFormat(trimmed.slice(3))}
                </h2>,
            );
            continue;
        }

        // H3 — opens a collapsible section that owns the blocks after it
        if (trimmed.startsWith('### ')) {
            flush();
            closeSection();
            section = { title: trimmed.slice(4), idx, children: [] };
            continue;
        }

        // Horizontal rule — tanpa ini "---" pemisah bab tampil sebagai
        // paragraf berisi teks "---". Dicek setelah tabel supaya baris
        // pemisah tabel tidak ikut tertangkap di sini.
        if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
            flush();
            sink().push(
                <hr key={`hr-${idx}`} className="my-6 border-border" />,
            );
            continue;
        }

        // Blockquote
        if (trimmed.startsWith('> ')) {
            flush();
            sink().push(
                <blockquote
                    key={`bq-${idx}`}
                    className="border-l-4 border-primary/30 pl-4 text-sm italic text-muted-foreground my-3 py-1"
                >
                    {inlineFormat(trimmed.slice(2))}
                </blockquote>,
            );
            continue;
        }

        // Ordered list
        const olMatch = trimmed.match(/^(\d+)\.\s+(.+)/);
        if (olMatch) {
            if (!listBuffer || !listBuffer.ordered) {
                flush();
                listBuffer = { ordered: true, items: [] };
            }
            listBuffer.items.push(olMatch[2]);
            continue;
        }

        // Unordered list
        const ulMatch = trimmed.match(/^[-*]\s+(.+)/);
        if (ulMatch) {
            if (!listBuffer || listBuffer.ordered) {
                flush();
                listBuffer = { ordered: false, items: [] };
            }
            listBuffer.items.push(ulMatch[1]);
            continue;
        }

        // Regular paragraph
        flush();
        sink().push(
            <p key={`p-${idx}`} className="text-sm leading-relaxed my-1.5">
                {inlineFormat(trimmed)}
            </p>,
        );
    }

    // Flush remaining code block
    if (inCodeBlock && codeBlockLines.length > 0) {
        sink().push(
            <pre
                key={`code-${codeBlockKey++}`}
                className="bg-muted/60 rounded-lg p-4 my-3 overflow-x-auto text-xs font-mono leading-relaxed border"
            >
                <code>{codeBlockLines.join('\n')}</code>
            </pre>,
        );
    }

    flush();
    closeSection();

    return <>{elements}</>;
}
