'use client';

import { FormEvent, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Bot,
  Send,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
  User,
  Copy,
  Check,
  BookOpen,
  X,
  RotateCcw,
  Sparkles,
  Package,
  ShoppingCart,
  Factory,
  CreditCard,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils/utils';

type Role = 'assistant' | 'user';
type Feedback = 'UP' | 'DOWN';

type CitedArticle = { slug: string; title: string; summary?: string; modules?: string[] };

type EvidenceChip = {
  source: 'tenant-data' | 'global-kb' | 'tenant-kb' | 'audit-log';
  label: string;
  checkedAt: string;
  href?: string;
};

type ChatMessage = {
  id: string;
  role: Role;
  text: string;
  interactionId?: string;
  feedback?: Feedback;
  citedArticles?: CitedArticle[];
  relatedArticles?: CitedArticle[];
  evidenceChips?: EvidenceChip[];
  needsClarification?: boolean;
  suggestions?: string[];
  confidence?: number;
};

type ChatApiResponse = {
  success: boolean;
  error?: string;
  data?: {
    answer: string;
    interactionId?: string;
    citedArticles?: CitedArticle[];
    relatedArticles?: CitedArticle[];
    evidence?: EvidenceChip[];
    conversationId?: string;
    needsClarification?: boolean;
    suggestions?: string[];
    confidence?: number;
    safety: { allowed: boolean; blockedReason?: string };
  };
};

const CATEGORIZED_PROMPTS = [
  {
    category: 'Stok & Gudang',
    icon: Package,
    color: 'from-amber-500/20 to-orange-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400',
    requiredResources: ['/warehouse/inventory'],
    prompts: [
      'Stok barang MP 15 kok tidak bisa dipakai buat SO?',
      'Barang ada di gudang tapi stok dianggap kurang',
      'Stok kritis minggu ini apa saja?',
    ],
  },
  {
    category: 'Penjualan (SO)',
    icon: ShoppingCart,
    color: 'from-blue-500/20 to-indigo-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400',
    requiredResources: ['/sales/orders'],
    prompts: [
      'Kenapa pesanan Budi belum bisa dikirim?',
      'Pesanan mana yang sedang pending?',
      'Cara buat Sales Order baru',
    ],
  },
  {
    category: 'Produksi (SPK)',
    icon: Factory,
    color: 'from-emerald-500/20 to-teal-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400',
    requiredResources: ['/production/orders'],
    prompts: [
      'SPK ini berhenti di mana?',
      'Kenapa saya tidak bisa buka menu ini?',
      'Cara input hasil produksi via Kiosk',
    ],
  },
  {
    category: 'Keuangan & Lainnya',
    icon: CreditCard,
    color: 'from-purple-500/20 to-pink-500/10 border-purple-500/30 text-purple-600 dark:text-purple-400',
    requiredResources: ['/finance'],
    prompts: [
      'Invoice customer ini sudah dibayar belum?',
      'Ringkasan piutang customer',
      'Urutan menerima barang dari supplier',
    ],
  },
];

interface PolyflowChatPanelProps {
  embedded?: boolean;
  initialQuestion?: string;
  allowedResources?: string[] | 'ALL';
}

function renderRichText(text: string) {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let listBuffer: { ordered: boolean; items: string[] } | null = null;

  const flushList = () => {
    if (!listBuffer) return;
    if (listBuffer.ordered) {
      elements.push(
        <ol key={`ol-${elements.length}`} className="list-decimal ml-5 my-2 space-y-1">
          {listBuffer.items.map((it, i) => (
            <li key={i} className="text-sm leading-relaxed">
              {inlineFormat(it)}
            </li>
          ))}
        </ol>
      );
    } else {
      elements.push(
        <ul key={`ul-${elements.length}`} className="list-disc ml-5 my-2 space-y-1">
          {listBuffer.items.map((it, i) => (
            <li key={i} className="text-sm leading-relaxed">
              {inlineFormat(it)}
            </li>
          ))}
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
      if (!listBuffer || !listBuffer.ordered) {
        flushList();
        listBuffer = { ordered: true, items: [] };
      }
      listBuffer.items.push(olMatch[2]);
      continue;
    }
    const ulMatch = trimmed.match(/^[-*]\s+(.+)/);
    if (ulMatch) {
      if (!listBuffer || listBuffer.ordered) {
        flushList();
        listBuffer = { ordered: false, items: [] };
      }
      listBuffer.items.push(ulMatch[1]);
      continue;
    }
    flushList();
    if (trimmed.startsWith('## ')) {
      elements.push(
        <h4 key={idx} className="font-bold text-sm tracking-tight text-foreground mt-3 mb-1">
          {inlineFormat(trimmed.slice(3))}
        </h4>
      );
    } else if (trimmed.startsWith('### ')) {
      elements.push(
        <h5 key={idx} className="font-semibold text-xs tracking-tight text-foreground mt-2 mb-1">
          {inlineFormat(trimmed.slice(4))}
        </h5>
      );
    } else {
      elements.push(
        <p key={idx} className="text-sm leading-relaxed my-0.5">
          {inlineFormat(trimmed)}
        </p>
      );
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
      parts.push(
        <code
          key={key++}
          className="px-1.5 py-0.5 rounded bg-muted/80 border border-border/50 text-xs font-mono text-emerald-600 dark:text-emerald-400"
        >
          {code}
        </code>
      );
    } else if (match[2]) {
      const bold = match[2].slice(2, -2);
      parts.push(
        <strong key={key++} className="font-semibold text-foreground">
          {bold}
        </strong>
      );
    } else if (match[3]) {
      const label = match[4];
      const url = match[5];
      const isInternal = url.startsWith('/support/');
      parts.push(
        <a
          key={key++}
          href={url}
          className="font-medium text-emerald-600 dark:text-emerald-400 underline underline-offset-4 hover:text-emerald-500 transition-colors"
          {...(isInternal ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
        >
          {label}
        </a>
      );
    } else if (match[6]) {
      parts.push(
        <a
          key={key++}
          href={match[6]}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-emerald-600 dark:text-emerald-400 underline underline-offset-4 hover:text-emerald-500"
        >
          {match[6]}
        </a>
      );
    } else if (match[7]) {
      parts.push(
        <Link
          key={key++}
          href={match[7]}
          className="font-medium text-emerald-600 dark:text-emerald-400 underline underline-offset-4 hover:text-emerald-500"
        >
          {match[7]}
        </Link>
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

function TypingDots({ longWait }: { longWait: boolean }) {
  return (
    <div className="flex items-center gap-3 pl-11 my-2">
      <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm border border-emerald-500/20 bg-emerald-500/5 dark:bg-emerald-950/20 px-4 py-3 shadow-sm">
        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-bounce [animation-delay:-0.3s]" />
        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-bounce [animation-delay:-0.15s]" />
        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-bounce" />
      </div>
      {longWait && <span className="text-xs text-muted-foreground">Sedang meracik data & analisis...</span>}
    </div>
  );
}

function CitedArticleCards({ articles, relatedArticles }: { articles: CitedArticle[]; relatedArticles?: CitedArticle[] }) {
  if (!articles.length) return null;
  return (
    <div className="mt-3 space-y-2 pt-2 border-t border-border/40">
      <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase flex items-center gap-1.5">
        <BookOpen className="h-3.5 w-3.5 text-emerald-500" /> Referensi Artikel Bantuan:
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {articles.slice(0, 3).map((a) => (
          <Link
            key={a.slug}
            href={`/support/${a.slug}`}
            className="group flex items-start gap-2.5 rounded-xl border border-border/60 bg-card/60 p-3 hover:bg-card hover:border-emerald-500/50 hover:shadow-sm transition-all duration-200"
          >
            <div className="mt-0.5 rounded-lg bg-emerald-500/10 p-1.5 text-emerald-600 dark:text-emerald-400 group-hover:bg-emerald-500 group-hover:text-white transition-colors shrink-0">
              <BookOpen className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground group-hover:text-emerald-600 dark:group-hover:text-emerald-400 line-clamp-1 transition-colors">
                {a.title}
              </p>
              {a.summary && <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">{a.summary}</p>}
            </div>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-emerald-500 group-hover:translate-x-0.5 transition-all self-center shrink-0" />
          </Link>
        ))}
      </div>
      {relatedArticles && relatedArticles.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-[11px] text-muted-foreground">Terkait:</span>
          {relatedArticles.slice(0, 3).map((a) => (
            <Link
              key={a.slug}
              href={`/support/${a.slug}`}
              className="text-[11px] px-2.5 py-1 rounded-full border border-border/50 bg-muted/40 hover:bg-muted text-muted-foreground hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
            >
              {a.title.length > 35 ? a.title.slice(0, 35) + '…' : a.title}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function PolyflowChatPanel({ embedded = false, initialQuestion, allowedResources = 'ALL' }: PolyflowChatPanelProps) {
  const [question, setQuestion] = useState(initialQuestion || '');
  const [isLoading, setIsLoading] = useState(false);
  const [longWait, setLongWait] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [initialSent, setInitialSent] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const abortRef = useRef<AbortController | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const isNearBottomRef = useRef(true);

  const initialWelcomeMsg: ChatMessage = {
    id: 'welcome',
    role: 'assistant',
    text: 'Halo! Saya **Asisten Kerja Polyflow** 🤖\n\nCeritakan saja apa yang ingin Anda ketahui atau kendala yang sedang terjadi. Saya dapat membantu mencari data yang boleh Anda lihat, menjelaskan penyebab, atau menunjukkan langkah yang perlu dilakukan.\n\n*Saya tidak akan mengubah transaksi. Untuk perubahan data, silakan gunakan menu yang tersedia.*',
  };

  const [messages, setMessages] = useState<ChatMessage[]>([initialWelcomeMsg]);

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
    isNearBottomRef.current = scrollHeight - scrollTop - clientHeight < 140;
  }, []);

  const scrollToBottom = useCallback((force = false) => {
    if (!force && !isNearBottomRef.current) return;
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, scrollToBottom]);

  // Filter prompt categories based on user permissions
  const filteredPromptCategories = useMemo(() => {
    if (allowedResources === 'ALL') return CATEGORIZED_PROMPTS;
    return CATEGORIZED_PROMPTS.filter((cat) =>
      cat.requiredResources.some((resource) =>
        allowedResources.some((allowed) =>
          allowed === resource || resource.startsWith(allowed + '/') || allowed.startsWith(resource + '/'),
        ),
      ),
    );
  }, [allowedResources]);

  const pushMessage = (
    role: Role,
    text: string,
    interactionId?: string,
    citedArticles?: CitedArticle[],
    relatedArticles?: CitedArticle[],
    evidenceChips?: EvidenceChip[],
    confidence?: number,
  ) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        role,
        text,
        interactionId,
        citedArticles,
        relatedArticles,
        evidenceChips,
        confidence,
      },
    ]);
  };

  const handleResetChat = () => {
    if (isLoading) handleCancel();
    setMessages([initialWelcomeMsg]);
    setQuestion('');
    setConversationId(undefined);
  };

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      /* ignore */
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
    setIsLoading(false);
    setLongWait(false);
  };

  useEffect(() => {
    if (!isLoading) {
      setLongWait(false);
      return;
    }
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
        body: JSON.stringify({ question: payload, conversationId }),
        signal: controller.signal,
      });

      const json = (await res.json()) as ChatApiResponse;

      if (!res.ok || !json.success) {
        pushMessage('assistant', json.error || 'Maaf, sistem sedang sibuk. Silakan coba beberapa saat lagi.');
        return;
      }

      // Update conversationId from response
      if (json.data?.conversationId) {
        setConversationId(json.data.conversationId);
      }

      pushMessage(
        'assistant',
        json.data?.answer || 'Maaf, belum ada jawaban yang bisa saya berikan.',
        json.data?.interactionId,
        json.data?.citedArticles,
        json.data?.relatedArticles,
        json.data?.evidence,
        json.data?.confidence,
      );
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        pushMessage('assistant', 'Permintaan dibatalkan.');
      } else {
        pushMessage('assistant', 'Koneksi ke server terputus. Silakan periksa jaringan dan coba lagi.');
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
        'flex h-full flex-col overflow-hidden rounded-3xl border border-border/80 bg-card/80 backdrop-blur-xl shadow-2xl transition-all duration-300',
        embedded ? 'min-h-[calc(100vh-12rem)]' : 'h-[75vh] max-h-[720px] min-h-[540px]'
      )}
    >
      {/* Header Bar */}
      <div className="relative border-b border-border/60 bg-gradient-to-r from-card via-muted/30 to-card px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/20">
              <Bot className="h-5 w-5" />
              <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 border-2 border-card"></span>
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-foreground tracking-tight">Asisten Kerja Polyflow</h2>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  <Sparkles className="h-3 w-3" /> AI Assistant
                </span>
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                <span>Tanyakan kendala kerja dengan bahasa sehari-hari</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {messages.length > 1 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleResetChat}
                className="h-8 text-xs gap-1.5 rounded-xl border-border/60 hover:bg-muted/80 transition-colors"
                title="Mulai Sesi Chat Baru"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Chat Baru</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Chat Messages Stream */}
      <div
        ref={scrollContainerRef}
        className="flex-1 min-h-0 overflow-y-auto bg-gradient-to-b from-transparent via-muted/10 to-transparent p-4 sm:p-6"
        onScroll={checkNearBottom}
      >
        <div className="space-y-6 max-w-4xl mx-auto">
          {/* Welcome Screen & Categorized Prompt Cards when only 1 message */}
          {messages.length <= 1 && (
            <div className="space-y-6 my-2 animate-in fade-in slide-in-from-bottom-2 duration-500">
              <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-transparent p-5 sm:p-6 shadow-sm text-center sm:text-left">
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500 text-white shadow-lg shadow-emerald-500/30">
                    <Sparkles className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-foreground tracking-tight">
                      Ceritakan kendala Anda
                    </h3>
                    <p className="text-xs sm:text-sm text-muted-foreground mt-1 leading-relaxed">
                      Jelaskan masalah atau pertanyaan Anda dengan bahasa sehari-hari. Saya akan mencari data, menjelaskan penyebab, atau menunjukkan langkah yang perlu dilakukan.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {filteredPromptCategories.map((cat) => {
                  const Icon = cat.icon;
                  return (
                    <div
                      key={cat.category}
                      className="rounded-2xl border border-border/60 bg-card/60 p-4 shadow-sm backdrop-blur-sm space-y-2.5"
                    >
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        <div className={cn('p-1.5 rounded-lg border bg-gradient-to-br', cat.color)}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <span>{cat.category}</span>
                      </div>
                      <div className="space-y-1.5">
                        {cat.prompts.map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => sendQuestion(p)}
                            className="w-full text-left text-xs p-2.5 rounded-xl border border-border/40 bg-muted/30 hover:bg-emerald-500/10 hover:border-emerald-500/40 text-foreground hover:text-emerald-600 dark:hover:text-emerald-400 font-medium transition-all duration-150 flex items-center justify-between group"
                          >
                            <span className="line-clamp-1">{p}</span>
                            <ArrowRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-emerald-500 shrink-0 ml-2" />
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Active Messages List */}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                'flex items-start gap-3 sm:gap-4 group/msg animate-in fade-in duration-200',
                msg.role === 'user' ? 'justify-end' : 'justify-start'
              )}
            >
              {msg.role === 'assistant' && (
                <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/20">
                  <Bot className="h-4 w-4" />
                </div>
              )}

              {msg.role === 'assistant' ? (
                <div className="flex flex-col max-w-[92%] sm:max-w-[85%] gap-1.5">
                  <div className="rounded-2xl rounded-tl-sm px-5 py-4 shadow-sm border border-border/60 bg-card text-foreground">
                    <div className="max-w-none break-words leading-relaxed">{renderRichText(msg.text)}</div>
                    {msg.citedArticles && msg.citedArticles.length > 0 && (
                      <CitedArticleCards articles={msg.citedArticles} relatedArticles={msg.relatedArticles} />
                    )}
                    {msg.evidenceChips && msg.evidenceChips.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-border/40">
                        {msg.evidenceChips.map((chip, i) => (
                          <span
                            key={i}
                            className={cn(
                              'inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border',
                              chip.source === 'tenant-data' && 'bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400',
                              chip.source === 'global-kb' && 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400',
                              chip.source === 'tenant-kb' && 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400',
                              chip.source === 'audit-log' && 'bg-gray-500/10 border-gray-500/20 text-gray-600 dark:text-gray-400',
                            )}
                          >
                            {chip.source === 'tenant-data' && '📊 '}
                            {chip.source === 'global-kb' && '📘 '}
                            {chip.source === 'tenant-kb' && '📋 '}
                            {chip.source === 'audit-log' && '🔍 '}
                            {chip.label}
                          </span>
                        ))}
                      </div>
                    )}
                    {msg.confidence !== undefined && (
                      <div className="flex items-center gap-1.5 mt-1.5 text-[10px] text-muted-foreground">
                        <span className={cn(
                          'px-1.5 py-0.5 rounded-full font-medium',
                          msg.confidence >= 0.8 && 'bg-emerald-500/10 text-emerald-600',
                          msg.confidence >= 0.5 && msg.confidence < 0.8 && 'bg-amber-500/10 text-amber-600',
                          msg.confidence < 0.5 && 'bg-red-500/10 text-red-600',
                        )}>
                          {msg.confidence >= 0.8 ? 'Tinggi' : msg.confidence >= 0.5 ? 'Sedang' : 'Rendah'}
                        </span>
                        <span>Confidence: {Math.round(msg.confidence * 100)}%</span>
                      </div>
                    )}
                    {msg.suggestions && msg.suggestions.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {msg.suggestions.map((suggestion, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => sendQuestion(suggestion)}
                            className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/15 hover:border-emerald-500/50 transition-colors font-medium"
                          >
                            <ArrowRight className="h-3 w-3" />
                            {suggestion.length > 50 ? suggestion.slice(0, 50) + '…' : suggestion}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Feedback & Copy Toolbar */}
                  <div className="flex items-center gap-2 px-1">
                    <button
                      onClick={() => handleCopy(msg.id, msg.text)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors opacity-70 group-hover/msg:opacity-100 focus:opacity-100"
                      title="Salin jawaban"
                    >
                      {copiedId === msg.id ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                          <span className="text-[11px] text-emerald-600 font-medium">Tersalin</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          <span className="text-[11px]">Salin</span>
                        </>
                      )}
                    </button>

                    {msg.interactionId && !msg.feedback && (
                      <div className="flex items-center gap-1 pl-2 border-l border-border/40 opacity-70 group-hover/msg:opacity-100">
                        <button
                          onClick={() => sendFeedback(msg.id, msg.interactionId!, 'UP')}
                          className="p-1 rounded-lg text-muted-foreground hover:text-emerald-600 hover:bg-emerald-500/10 transition-colors"
                          title="Membantu"
                        >
                          <ThumbsUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => sendFeedback(msg.id, msg.interactionId!, 'DOWN')}
                          className="p-1 rounded-lg text-muted-foreground hover:text-rose-600 hover:bg-rose-500/10 transition-colors"
                          title="Tidak membantu"
                        >
                          <ThumbsDown className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}

                    {msg.feedback && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground pl-2 border-l border-border/40">
                        {msg.feedback === 'UP' ? (
                          <span className="flex items-center gap-1 text-emerald-600 font-medium text-[11px]">
                            <ThumbsUp className="h-3 w-3" /> Terima kasih atas penilaian Anda!
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-rose-500 font-medium text-[11px]">
                            <ThumbsDown className="h-3 w-3" /> Ulasan dicatat untuk perbaikan.
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-end max-w-[88%] sm:max-w-[80%] gap-1">
                  <div className="rounded-2xl rounded-tr-sm px-5 py-3.5 text-sm leading-relaxed shadow-md bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-medium">
                    <div className="whitespace-pre-wrap break-words">{msg.text}</div>
                  </div>
                </div>
              )}

              {msg.role === 'user' && (
                <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-muted border border-border/80 text-foreground shadow-sm">
                  <User className="h-4.5 w-4.5" />
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="space-y-2">
              <TypingDots longWait={longWait} />
              {longWait && (
                <div className="pl-13">
                  <button
                    onClick={handleCancel}
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border/60 rounded-full px-3 py-1 bg-card hover:bg-muted transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                    Batalkan Pemrosesan
                  </button>
                </div>
              )}
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input Dock */}
      <div className="border-t border-border/60 bg-gradient-to-b from-card/90 to-card p-4 backdrop-blur-xl">
        <form onSubmit={onSubmit} className="max-w-4xl mx-auto">
          <div className="relative flex items-end gap-2 rounded-2xl border border-border/80 bg-background/80 p-2 shadow-inner focus-within:border-emerald-500/50 focus-within:ring-2 focus-within:ring-emerald-500/20 transition-all duration-200">
            <Textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ceritakan kendala atau pertanyaan Anda..."
              className="min-h-[46px] max-h-[140px] flex-1 resize-none border-0 bg-transparent py-3 px-3 shadow-none focus-visible:ring-0 text-sm placeholder:text-muted-foreground/70 font-medium"
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
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mb-1 shrink-0 rounded-xl h-10 px-3 border-border/60"
                onClick={handleCancel}
              >
                <X className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="submit"
                disabled={!canSend}
                className="mb-1 shrink-0 rounded-xl h-10 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold shadow-md hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all duration-150 disabled:opacity-50"
              >
                <Send className="h-4 w-4 mr-1.5" />
                Kirim
              </Button>
            )}
          </div>

          <div className="flex items-center justify-between mt-2 px-2 text-[11px] text-muted-foreground">
            <div className="flex items-center gap-2">
              <span>
                Tekan <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted/60 font-mono text-[10px]">Enter ↵</kbd> untuk kirim
              </span>
              <span>•</span>
              <span>
                <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted/60 font-mono text-[10px]">Shift + Enter</kbd> baris baru
              </span>
            </div>

            {nearLimit && (
              <span className={cn(charCount >= 2000 ? 'text-rose-500 font-bold' : 'text-amber-600 font-medium')}>
                {charCount}/2000
              </span>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
