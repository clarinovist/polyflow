'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Loader2, Send, ShieldCheck, ThumbsDown, ThumbsUp, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils/utils';

type Role = 'assistant' | 'user';
type Feedback = 'UP' | 'DOWN';

type ChatMessage = {
  id: string;
  role: Role;
  text: string;
  interactionId?: string;
  feedback?: Feedback;
};

type ChatApiResponse = {
  success: boolean;
  error?: string;
  data?: {
    answer: string;
    interactionId?: string;
    safety: {
      allowed: boolean;
      blockedReason?: string;
    };
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
}


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

  const pushMessage = (role: Role, text: string, interactionId?: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        role,
        text,
        interactionId,
      },
    ]);

  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isLoading]);

  const sendFeedback = async (messageId: string, interactionId: string, feedback: Feedback) => {
    const previousFeedback = messages.find((m) => m.id === messageId)?.feedback;

    setMessages((prev) =>
      prev.map((msg) => (msg.id === messageId ? { ...msg, feedback } : msg))
    );

    try {
      const res = await fetch('/api/chat/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interactionId, feedback }),
      });

      if (!res.ok) {
        // Rollback on server error
        setMessages((prev) =>
          prev.map((msg) => (msg.id === messageId ? { ...msg, feedback: previousFeedback } : msg))
        );
      }
    } catch {
      // Rollback on network error
      setMessages((prev) =>
        prev.map((msg) => (msg.id === messageId ? { ...msg, feedback: previousFeedback } : msg))
      );
    }
  };

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

      pushMessage('assistant', json.data?.answer || 'Maaf, belum ada jawaban yang bisa saya berikan.', json.data?.interactionId);
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

          </div>
          <div className="rounded-lg border border-brand-border bg-brand-glass p-2 shadow-inner text-primary">
            <ShieldCheck className="h-5 w-5" />
          </div>
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

              {msg.role === 'assistant' ? (
                <div className="flex flex-col max-w-[85%]">
                  <div className="rounded-2xl rounded-tl-sm px-4 py-3 text-[15px] leading-relaxed shadow-sm backdrop-blur-md border border-brand-border bg-brand-glass-heavy text-foreground">
                    <div className="prose prose-sm prose-slate dark:prose-invert max-w-none break-words whitespace-pre-wrap leading-relaxed">
                      {msg.text}
                    </div>
                  </div>

                  {msg.interactionId && !msg.feedback && (
                    <div className="flex items-center gap-1 mt-1">
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
                    </div>
                  )}

                  {msg.feedback && (
                    <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                      {msg.feedback === 'UP' ? (
                        <span className="flex items-center gap-1 text-green-600"><ThumbsUp className="h-3 w-3" /> Terima kasih atas feedbacknya!</span>
                      ) : (
                        <span className="flex items-center gap-1 text-red-500"><ThumbsDown className="h-3 w-3" /> Feedback dicatat, akan kami perbaiki.</span>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="max-w-[85%] rounded-2xl rounded-tr-sm px-4 py-3 text-[15px] leading-relaxed shadow-sm backdrop-blur-md bg-gradient-to-br from-primary to-primary/90 text-primary-foreground border border-primary/20 shadow-md">
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
            <div className="flex items-center gap-2 pl-11 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="italic">Virtual CS sedang memproses...</span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

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
            placeholder="Ketik pertanyaan Anda..."
            className="min-h-[44px] flex-1 resize-none border-0 bg-transparent py-2.5 px-2 shadow-none focus-visible:ring-0 text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 font-medium"
            disabled={isLoading}
            autoFocus
          />
          <Button type="submit" disabled={!canSend} className="mb-0.5 shrink-0 gap-2 shadow-md hover:scale-[1.02] transition-transform">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Kirim
          </Button>
        </div>
      </form>
    </div>
  );
}

