'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Loader2, Send, ShieldCheck, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils/utils';

type Role = 'assistant' | 'user';

type ChatMessage = {
  id: string;
  role: Role;
  text: string;
};

type ChatApiResponse = {
  success: boolean;
  error?: string;
  data?: {
    answer: string;
    safety: {
      allowed: boolean;
      blockedReason?: string;
    };
  };
};

interface PolyflowChatPanelProps {
  embedded?: boolean;
}

const STARTER_QUESTIONS = [
  'Stok kritis hari ini bagaimana?',
  'Ada SPK produksi yang aktif?',
  'Pending sales order saat ini berapa?',
  'Cara cek mutasi stok hari ini?',
];

export function PolyflowChatPanel({ embedded = false }: PolyflowChatPanelProps) {
  const [question, setQuestion] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'Halo, saya Virtual CS Polyflow. Saya bisa bantu cek data operasional dan panduan SOP pemakaian sistem. Saya tidak bisa mengubah data, jadi revisi tetap dilakukan lewat UI Polyflow ya.',
    },
  ]);

  const bottomRef = useRef<HTMLDivElement | null>(null);

  const canSend = useMemo(() => question.trim().length > 0 && !isLoading, [question, isLoading]);

  const pushMessage = (role: Role, text: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        role,
        text,
      },
    ]);

  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isLoading]);

  const sendQuestion = async (incoming?: string) => {
    const payload = (incoming ?? question).trim();
    if (!payload || isLoading) return;

    pushMessage('user', payload);
    setQuestion('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ question: payload }),
      });

      const json = (await res.json()) as ChatApiResponse;

      if (!res.ok || !json.success) {
        pushMessage('assistant', json.error || 'Maaf, sistem sedang sibuk. Coba lagi sebentar ya.');
        return;
      }

      pushMessage('assistant', json.data?.answer || 'Maaf, belum ada jawaban yang bisa saya berikan.');
    } catch {
      pushMessage('assistant', 'Koneksi ke server terputus. Silakan coba lagi.');
    } finally {
      setIsLoading(false);
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
            <p className="mt-1 text-sm text-muted-foreground">Bantu cek data operasional dan panduan SOP untuk tim non-teknis.</p>
          </div>
          <div className="rounded-lg border border-brand-border bg-brand-glass p-2 shadow-inner text-primary">
            <ShieldCheck className="h-5 w-5" />
          </div>
        </div>
      </div>

      <div className="border-b border-brand-border bg-brand-glass/50 px-4 py-3">
        <div className="flex flex-wrap gap-2">
          {STARTER_QUESTIONS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => void sendQuestion(item)}
              disabled={isLoading}
              className="rounded-full border border-brand-border bg-brand-glass px-3 py-1 text-xs font-medium text-foreground transition-all hover:border-brand-border-heavy hover:bg-brand-glass-heavy focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-60 shadow-sm"
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0 bg-transparent">
        <div className="space-y-4 p-4">
          {messages.map((msg) => (
            <div key={msg.id} className={cn('flex items-start gap-3', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
              {msg.role === 'assistant' && (
                <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-glass-heavy text-primary border border-brand-border-heavy shadow-sm">
                  <Bot className="h-4 w-4" />
                </div>
              )}

              <div
                className={cn(
                  'max-w-[85%] rounded-2xl px-4 py-3 text-[15px] leading-relaxed shadow-sm backdrop-blur-md',
                  msg.role === 'user'
                    ? 'rounded-tr-sm bg-gradient-to-br from-primary to-primary/90 text-primary-foreground border border-primary/20 shadow-md'
                    : 'rounded-tl-sm border border-brand-border bg-brand-glass-heavy text-foreground'
                )}
              >
                {msg.role === 'assistant' ? (
                  <div className="prose prose-sm prose-slate dark:prose-invert max-w-none break-words whitespace-pre-wrap leading-relaxed">
                    {msg.text}
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap break-words">{msg.text}</div>
                )}
              </div>

              {msg.role === 'user' && (
                <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-glass text-foreground border border-brand-border shadow-sm">
                  <User className="h-4 w-4" />
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex items-center gap-2 pl-11 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="italic">Virtual CS sedang memproses...</span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <form onSubmit={onSubmit} className="border-t border-brand-border bg-brand-glass-heavy p-4 backdrop-blur-md">
        <div className="rounded-xl border border-brand-border bg-brand-glass/50 p-2 shadow-inner focus-within:border-brand-border-heavy focus-within:bg-brand-glass-heavy transition-all duration-300">
          <Textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Ketik pertanyaan Anda, contoh: stok kritis hari ini bagaimana?"
            className="min-h-[44px] resize-none border-0 bg-transparent p-2 shadow-none focus-visible:ring-0 text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 font-medium"
            disabled={isLoading}
            autoFocus
          />
          <div className="flex items-center justify-between px-2 pb-1 pt-2 border-t border-brand-border/50 mt-2">
            <p className="text-xs text-muted-foreground">Read-only: perubahan data tetap melalui menu Polyflow.</p>
            <Button type="submit" disabled={!canSend} className="gap-2 shadow-md hover:scale-[1.02] transition-transform">
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Kirim
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

