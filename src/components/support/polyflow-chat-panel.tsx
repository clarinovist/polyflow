'use client';

import { FormEvent, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { Bot, Send, ShieldCheck, ThumbsDown, ThumbsUp, User, Copy, Check, BookOpen, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils/utils';

type Role = 'assistant' | 'user';
type Feedback = 'UP' | 'DOWN';

type CitedArticle = { slug: string; title: string; summary?: string; };

type ChatMessage = {
  id: string;
  role: Role;
  text: string;
  interactionId?: string;
  feedback?: Feedback;
  citedArticles?: CitedArticle[];
};

type ChatApiResponse = {
  success: boolean;
  error?: string;
  data?: {
    answer: string;
    interactionId?: string;
    citedArticles?: CitedArticle[];
    safety: { allowed: boolean; blockedReason?: string; };
  };
};

const QUICK_ASK_CHIPS = [
  'Cara buat Sales Order?',
  'Cek stok kritis',
  'Cara terima barang?',
  'SPK yang sedang jalan',
  'Invoice belum lunas',
  'Cara input stok awal',
  'Role & permission user',
  'Cara eskalasi masalah',
];

interface PolyflowChatPanelProps {
  embedded?: boolean;
  initialQuestion?: string;
}

function renderRichText(text: string) {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let listBuffer: { ordered: boolean; items: string[] } | null = null;

  const flushList = () => {
    if (!listBuffer) return;
    if (listBuffer.ordered) {
      elements.push(
        <ol key={`ol-${elements.length}`} className="list-decimal ml-5 my-1.5 space-y-0.5">
          {listBuffer.items.map((it, i) => <li key={i} className="text-[14px] leading-relaxed">{inlineFormat(it)}</li>)}
        </ol>
      );
    } else {
      elements.push(
        <ul key={`ul-${elements.length}`} className="list-disc ml-5 my-1.5 space-y-0.5">
          {listBuffer.items.map((it, i) => <li key={i} className="text-[14px] leading-relaxed">{inlineFormat(it)}</li>)}
        </ul>
      );
    }
    listBuffer = null;
  };

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const trimmed = line.trim();
    if (trimmed === '') {
      flushList();
      elements.push(<div key={`br-${idx}`} className="h-2" />);
      continue;
    }
    const olMatch = trimmed.match(/^(\d+)\.\s+(.+)/);
    if (olMatch) {
      if (!listBuffer || !listBuffer.ordered) { flushList(); listBuffer = { ordered: true, items: [] }; }
      listBuffer.items.push(olMatch[2]);
      continue;
    }
    const ulMatch = trimmed.match(/^[-*]\s+(.+)/);
    if (ulMatch) {
      if (!listBuffer || listBuffer.ordered) { flushList(); listBuffer = { ordered: false, items: [] }; }
      listBuffer.items.push(ulMatch[1]);
      continue;
    }
    flushList();
    if (trimmed.startsWith('## ')) {
      elements.push(<p key={idx} className="font-semibold text-[14px] mt-2">{inlineFormat(trimmed.slice(3))}</p>);
    } else {
      elements.push(<p key={idx} className="text-[14px] leading-relaxed my-0.5">{inlineFormat(trimmed)}</p>);
    }
  }
  flushList();
  return <>{elements}</>;
}

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
      parts.push(<code key={key++} className="px-1 py-0.5 rounded bg-muted text-xs font-mono">{code}</code>);
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

function TypingDots({ longWait }: { longWait: boolean }) {
  return (
    <div className="flex items-center gap-3 pl-11">
      <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm border border-brand-border bg-brand-glass-heavy px-4 py-3 shadow-sm">
        <span className="h-2 w-2 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
        <span className="h-2 w-2 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
        <span className="h-2 w-2 rounded-full bg-primary animate-bounce" />
      </div>
      {longWait && <span className="text-xs text-muted-foreground">Masih memproses…</span>}
    </div>
  );
}

function CitedArticleCards({ articles }: { articles: CitedArticle[] }) {
  if (!articles.length) return null;
  return (
    <div className="mt-2 space-y-1.5">
      {articles.slice(0, 3).map((a) => (
        <Link
          key={a.slug}
          href={`/support/${a.slug}`}
          className="flex items-start gap-2 rounded-xl border border-brand-border bg-brand-glass p-3 hover:bg-brand-glass-heavy transition-colors group/card"
        >
          <div className="mt-0.5 rounded-md bg-primary/10 p-1 text-primary">
            <BookOpen className="h-3.5 w-3.5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-foreground group-hover/card:text-primary line-clamp-1">{a.title}</p>
            {a.summary && <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">{a.summary}</p>}
          </div>
          <span className="text-[11px] text-primary shrink-0 self-center">Buka →</span>
        </Link>
      ))}
    </div>
  );
}

export function PolyflowChatPanel({ embedded = false, initialQuestion }: PolyflowChatPanelProps) {
  const [question, setQuestion] = useState(initialQuestion || '');
  const [isLoading, setIsLoading] = useState(false);
  const [longWait, setLongWait] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [initialSent, setInitialSent] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const isNearBottomRef = useRef(true);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'Halo, saya Virtual CS Polyflow. Saya bisa bantu cek data operasional dan panduan pemakaian sistem. Saya tidak bisa mengubah data, jadi revisi tetap dilakukan lewat UI Polyflow ya.',
    },
  ]);

  const canSend = useMemo(() => question.trim().length > 0 && !isLoading, [question, isLoading]);
  const nearLimit = question.length >= 1800;
  const charCount = question.length;

  useEffect(() => {
    if (initialQuestion && !initialSent) {
      setInitialSent(true);
    }
  }, [initialQuestion, initialSent]);

  const checkNearBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    isNearBottomRef.current = scrollHeight - scrollTop - clientHeight < 120;
  }, []);

  const scrollToBottom = useCallback((force = false) => {
    if (!force && !isNearBottomRef.current) return;
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, scrollToBottom]);

  const pushMessage = (role: Role, text: string, interactionId?: string, citedArticles?: CitedArticle[]) => {
    setMessages((prev) => [
      ...prev,
      { id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, role, text, interactionId, citedArticles },
    ]);
  };

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch { /* ignore */ }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
    setIsLoading(false);
    setLongWait(false);
  };

  useEffect(() => {
    if (!isLoading) { setLongWait(false); return; }
    const t = setTimeout(() => setLongWait(true), 12000);
    return () => clearTimeout(t);
  }, [isLoading]);

  const sendFeedback = async (messageId: string, interactionId: string, feedback: Feedback) => {
    const previousFeedback = messages.find((m) => m.id === messageId)?.feedback;
    setMessages((prev) => prev.map((msg) => (msg.id === messageId ? { ...msg, feedback } : msg)));
    try {
      const res = await fetch('/api/chat/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interactionId, feedback }),
      });
      if (!res.ok) {
        setMessages((prev) => prev.map((msg) => (msg.id === messageId ? { ...msg, feedback: previousFeedback } : msg)));
      }
    } catch {
      setMessages((prev) => prev.map((msg) => (msg.id === messageId ? { ...msg, feedback: previousFeedback } : msg)));
    }
  };

  const sendQuestion = async (incoming?: string) => {
    const payload = (incoming ?? question).trim();
    if (!payload || isLoading) return;

    pushMessage('user', payload);
    setQuestion('');
    setIsLoading(true);
    setLongWait(false);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: payload }),
        signal: controller.signal,
      });

      const json = (await res.json()) as ChatApiResponse;

      if (!res.ok || !json.success) {
        pushMessage('assistant', json.error || 'Maaf, sistem sedang sibuk. Coba lagi sebentar ya.');
        return;
      }

      pushMessage(
        'assistant',
        json.data?.answer || 'Maaf, belum ada jawaban yang bisa saya berikan.',
        json.data?.interactionId,
        json.data?.citedArticles,
      );
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        pushMessage('assistant', 'Permintaan dibatalkan.');
      } else {
        pushMessage('assistant', 'Koneksi ke server terputus. Silakan coba lagi.');
      }
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await sendQuestion();
  };

  return (
    <div
      className={cn(
        'flex h-full flex-col overflow-hidden rounded-3xl border border-brand-border bg-brand-glass backdrop-blur-[16px] shadow-[var(--shadow-brand)]',
        embedded ? 'min-h-[calc(100vh-10rem)]' : 'h-[72vh] max-h-[680px] min-h-[520px]'
      )}
    >
      <div className="relative border-b border-brand-border bg-brand-glass-heavy px-5 py-4">
        <div className="pointer-events-none absolute inset-0 opacity-10 [background:radial-gradient(circle_at_20%_20%,var(--color-primary),transparent_32%),radial-gradient(circle_at_80%_0%,var(--color-primary),transparent_28%)]" />
        <div className="relative flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Polyflow Support</p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">Virtual CS (Read-Only)</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Panduan & cek data · tidak mengubah transaksi</p>
          </div>
          <div className="rounded-lg border border-brand-border bg-brand-glass p-2 shadow-inner text-primary">
            <ShieldCheck className="h-5 w-5" />
          </div>
        </div>
      </div>

      <div
        ref={scrollContainerRef}
        className="flex-1 min-h-0 overflow-y-auto bg-transparent"
        onScroll={checkNearBottom}
      >
        <div className="space-y-4 p-4">
          {messages.map((msg) => (
            <div key={msg.id} className={cn('flex items-start gap-3 group/msg', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
              {msg.role === 'assistant' && (
                <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-glass-heavy text-primary border border-brand-border-heavy shadow-sm">
                  <Bot className="h-4 w-4" />
                </div>
              )}

              {msg.role === 'assistant' ? (
                <div className="flex flex-col max-w-[85%] gap-1">
                  <div className="rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm backdrop-blur-md border border-brand-border bg-brand-glass-heavy text-foreground">
                    <div className="max-w-none break-words">
                      {renderRichText(msg.text)}
                    </div>
                  </div>

                  {msg.citedArticles && msg.citedArticles.length > 0 && (
                    <CitedArticleCards articles={msg.citedArticles} />
                  )}

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleCopy(msg.id, msg.text)}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors opacity-0 group-hover/msg:opacity-100 focus:opacity-100"
                      title="Salin jawaban"
                    >
                      {copiedId === msg.id ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>

                    {msg.interactionId && !msg.feedback && (
                      <>
                        <button
                          onClick={() => sendFeedback(msg.id, msg.interactionId!, 'UP')}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-950 transition-colors"
                          title="Membantu"
                        >
                          <ThumbsUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => sendFeedback(msg.id, msg.interactionId!, 'DOWN')}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
                          title="Tidak membantu"
                        >
                          <ThumbsDown className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>

                  {msg.feedback && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      {msg.feedback === 'UP' ? (
                        <span className="flex items-center gap-1 text-green-600"><ThumbsUp className="h-3 w-3" /> Terima kasih!</span>
                      ) : (
                        <span className="flex items-center gap-1 text-red-500"><ThumbsDown className="h-3 w-3" /> Feedback dicatat.</span>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="max-w-[85%] rounded-2xl rounded-tr-sm px-4 py-3 text-[14px] leading-relaxed shadow-sm backdrop-blur-md bg-gradient-to-br from-primary to-primary/90 text-primary-foreground border border-primary/20 shadow-md">
                  <div className="whitespace-pre-wrap break-words">{msg.text}</div>
                </div>
              )}

              {msg.role === 'user' && (
                <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-glass text-foreground border border-brand-border shadow-sm">
                  <User className="h-4 w-4" />
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="space-y-2">
              <TypingDots longWait={longWait} />
              {longWait && (
                <div className="pl-11">
                  <button
                    onClick={handleCancel}
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-full px-3 py-1 hover:bg-muted transition-colors"
                  >
                    <X className="h-3 w-3" />
                    Batalkan
                  </button>
                </div>
              )}
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <form onSubmit={onSubmit} className="border-t border-brand-border bg-brand-glass-heavy p-4 backdrop-blur-md">
        {messages.length <= 1 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {QUICK_ASK_CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => sendQuestion(chip)}
                className="text-xs px-3 py-1.5 rounded-full border border-brand-border bg-brand-glass hover:bg-brand-glass-heavy text-muted-foreground hover:text-foreground transition-colors"
              >
                {chip}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2 rounded-xl border border-brand-border bg-brand-glass/50 p-2 shadow-inner focus-within:border-brand-border-heavy focus-within:bg-brand-glass-heavy transition-all duration-300">
          <Textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Ketik pertanyaan… Enter kirim, Shift+Enter baris baru"
            className="min-h-[44px] max-h-[120px] flex-1 resize-none border-0 bg-transparent py-2.5 px-2 shadow-none focus-visible:ring-0 text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 font-medium"
            disabled={isLoading}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (canSend) sendQuestion();
              }
            }}
          />
          {isLoading ? (
            <Button type="button" variant="outline" size="sm" className="mb-0.5 shrink-0" onClick={handleCancel}>
              <X className="h-4 w-4" />
            </Button>
          ) : (
            <Button type="submit" disabled={!canSend} className="mb-0.5 shrink-0 gap-2 shadow-md hover:scale-[1.02] transition-transform">
              <Send className="h-4 w-4" />
              Kirim
            </Button>
          )}
        </div>
        <div className="flex items-center justify-between mt-1.5 px-1">
          <span className="text-[10px] text-muted-foreground">Enter kirim · Shift+Enter baris baru</span>
          {nearLimit && (
            <span className={cn('text-[10px]', charCount >= 2000 ? 'text-red-500 font-medium' : 'text-amber-600')}>
              {charCount}/2000
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
