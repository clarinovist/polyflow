import Link from 'next/link';
import { ChevronDown } from 'lucide-react';

function inlineFormat(text: string): React.ReactNode {
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[([^\]]+)\]\(([^)]+)\))|(https?:\/\/[^\s]+)|(\/support\/[a-z0-9-]+)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>);
    }
    if (match[1]) {
      const code = match[1].slice(1, -1);
      parts.push(<code key={key++} className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono">{code}</code>);
    } else if (match[2]) {
      const bold = match[2].slice(2, -2);
      parts.push(<strong key={key++} className="font-semibold">{bold}</strong>);
    } else if (match[3]) {
      const label = match[4];
      const url = match[5];
      const isInternal = url.startsWith('/support/');
      parts.push(
        <a key={key++} href={url} className="text-primary underline underline-offset-2 hover:text-primary/80" {...(isInternal ? {} : { target: '_blank', rel: 'noopener noreferrer' })}>
          {label}
        </a>
      );
    } else if (match[6]) {
      parts.push(<a key={key++} href={match[6]} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">{match[6]}</a>);
    } else if (match[7]) {
      parts.push(<Link key={key++} href={match[7]} className="text-primary underline underline-offset-2">{match[7]}</Link>);
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
  keyPrefix: string
) {
  if (!listBuffer) return;
  if (listBuffer.ordered) {
    elements.push(
      <ol key={`${keyPrefix}-ol-${elements.length}`} className="list-decimal ml-5 my-2 space-y-1">
        {listBuffer.items.map((it, i) => <li key={i} className="text-sm leading-relaxed">{inlineFormat(it)}</li>)}
      </ol>
    );
  } else {
    elements.push(
      <ul key={`${keyPrefix}-ul-${elements.length}`} className="list-disc ml-5 my-2 space-y-1">
        {listBuffer.items.map((it, i) => <li key={i} className="text-sm leading-relaxed">{inlineFormat(it)}</li>)}
      </ul>
    );
  }
}

/**
 * Render markdown-like article body into structured JSX.
 * Handles: ## headings, ### collapsible sections, bold, inline code,
 * links, ordered/unordered lists, blockquotes, code blocks.
 */
export function ArticleBodyRenderer({ bodyMd }: { bodyMd: string }) {
  const lines = bodyMd.split('\n');
  const elements: React.ReactNode[] = [];
  let listBuffer: { ordered: boolean; items: string[] } | null = null;
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];
  let codeBlockKey = 0;

  const flush = () => {
    flushList(listBuffer, elements, `art-${elements.length}`);
    listBuffer = null;
  };

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const trimmed = line.trim();

    // Code block toggle
    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        elements.push(
          <pre key={`code-${codeBlockKey++}`} className="bg-muted/60 rounded-lg p-4 my-3 overflow-x-auto text-xs font-mono leading-relaxed border">
            <code>{codeBlockLines.join('\n')}</code>
          </pre>
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

    // H2 heading
    if (trimmed.startsWith('## ')) {
      flush();
      elements.push(
        <h2 key={`h2-${idx}`} className="text-lg font-bold mt-8 mb-3 pb-1.5 border-b border-border">
          {inlineFormat(trimmed.slice(3))}
        </h2>
      );
      continue;
    }

    // H3 - collapsible technical section
    if (trimmed.startsWith('### ')) {
      flush();
      elements.push(
        <details key={`h3-${idx}`} className="my-4 group">
          <summary className="flex items-center gap-2 cursor-pointer text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors select-none">
            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
            {inlineFormat(trimmed.slice(4))}
          </summary>
          <div className="mt-2 pl-6 border-l-2 border-border space-y-2" />
        </details>
      );
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('> ')) {
      flush();
      elements.push(
        <blockquote key={`bq-${idx}`} className="border-l-4 border-primary/30 pl-4 text-sm italic text-muted-foreground my-3 py-1">
          {inlineFormat(trimmed.slice(2))}
        </blockquote>
      );
      continue;
    }

    // Ordered list
    const olMatch = trimmed.match(/^(\d+)\.\s+(.+)/);
    if (olMatch) {
      if (!listBuffer || !listBuffer.ordered) { flush(); listBuffer = { ordered: true, items: [] }; }
      listBuffer.items.push(olMatch[2]);
      continue;
    }

    // Unordered list
    const ulMatch = trimmed.match(/^[-*]\s+(.+)/);
    if (ulMatch) {
      if (!listBuffer || listBuffer.ordered) { flush(); listBuffer = { ordered: false, items: [] }; }
      listBuffer.items.push(ulMatch[1]);
      continue;
    }

    // Regular paragraph
    flush();
    elements.push(
      <p key={`p-${idx}`} className="text-sm leading-relaxed my-1.5">{inlineFormat(trimmed)}</p>
    );
  }

  // Flush remaining code block
  if (inCodeBlock && codeBlockLines.length > 0) {
    elements.push(
      <pre key={`code-${codeBlockKey++}`} className="bg-muted/60 rounded-lg p-4 my-3 overflow-x-auto text-xs font-mono leading-relaxed border">
        <code>{codeBlockLines.join('\n')}</code>
      </pre>
    );
  }

  flush();

  return <>{elements}</>;
}
