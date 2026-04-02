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
        'flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_55px_-30px_rgba(15,23,42,0.55)]',
        embedded ? 'min-h-[calc(100vh-10rem)]' : 'h-[72vh] max-h-[680px] min-h-[520px]'
      )}
    >
      <div className="relative border-b border-slate-200 bg-gradient-to-r from-cyan-600 via-teal-600 to-emerald-600 px-5 py-4 text-white">
        <div className="pointer-events-none absolute inset-0 opacity-30 [background:radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.45),transparent_32%),radial-gradient(circle_at_80%_0%,rgba(255,255,255,0.3),transparent_28%)]" />
        <div className="relative flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100">Polyflow Support</p>
            <h2 className="mt-1 text-lg font-semibold">Virtual CS (Read-Only)</h2>
            <p className="mt-1 text-sm text-cyan-50">Bantu cek data operasional dan panduan SOP untuk tim non-teknis.</p>
          </div>
          <div className="rounded-lg bg-white/15 p-2">
            <ShieldCheck className="h-5 w-5" />
          </div>
        </div>
      </div>

      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex flex-wrap gap-2">
          {STARTER_QUESTIONS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => void sendQuestion(item)}
              disabled={isLoading}
              className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 transition hover:border-teal-500 hover:text-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0 bg-slate-50/50">
        <div className="space-y-4 p-4">
          {messages.map((msg) => (
            <div key={msg.id} className={cn('flex items-start gap-3', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
              {msg.role === 'assistant' && (
                <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-600 text-white shadow-sm">
                  <Bot className="h-4 w-4" />
                </div>
              )}

              <div
                className={cn(
                  'max-w-[85%] rounded-2xl px-4 py-3 text-[15px] leading-relaxed shadow-sm',
                  msg.role === 'user'
                    ? 'rounded-tr-sm bg-gradient-to-br from-slate-800 to-slate-900 text-white'
                    : 'rounded-tl-sm border border-slate-200 bg-white text-slate-800'
                )}
              >
                {msg.role === 'assistant' ? (
                  <div className="prose prose-sm prose-slate max-w-none break-words whitespace-pre-wrap leading-relaxed">
                    {msg.text}
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap break-words">{msg.text}</div>
                )}
              </div>

              {msg.role === 'user' && (
                <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-700 shadow-sm">
                  <User className="h-4 w-4" />
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex items-center gap-2 pl-11 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
              <span className="italic">Virtual CS sedang memproses...</span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <form onSubmit={onSubmit} className="border-t border-slate-200 bg-white p-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
          <Textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Ketik pertanyaan Anda, contoh: stok kritis hari ini bagaimana?"
            className="min-h-[90px] resize-none border-0 bg-transparent p-2 shadow-none focus-visible:ring-0"
            disabled={isLoading}
            autoFocus
          />
          <div className="flex items-center justify-between px-2 pb-1">
            <p className="text-xs text-slate-500">Read-only: perubahan data tetap melalui menu Polyflow.</p>
            <Button type="submit" disabled={!canSend} className="gap-2 bg-teal-600 hover:bg-teal-700">
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Kirim
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
