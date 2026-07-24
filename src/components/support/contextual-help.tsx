'use client';

import { useState } from 'react';
import { HelpCircle, MessageCircle, BookOpen, X } from 'lucide-react';
import Link from 'next/link';

interface ContextualHelpLink {
  title: string;
  slug: string;
}

interface ContextualHelpProps {
  links: ContextualHelpLink[];
  title?: string;
  prefillQuestion?: string;
}

export function ContextualHelp({ links, title = 'Butuh bantuan?', prefillQuestion }: ContextualHelpProps) {
  const [open, setOpen] = useState(false);
  const csHref = prefillQuestion
    ? `/support/cs?q=${encodeURIComponent(prefillQuestion)}`
    : '/support/cs';

  if (!links.length) return null;

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-full border border-brand-border bg-brand-glass px-2.5 py-1"
        title={title}
      >
        <HelpCircle className="h-3.5 w-3.5" />
        <span className="hidden sm:inline text-xs font-medium">{title}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-50 w-80 rounded-2xl border border-brand-border bg-card shadow-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-brand-glass-heavy">
              <span className="text-sm font-semibold flex items-center gap-1.5"><BookOpen className="h-4 w-4 text-primary" /> Panduan Terkait</span>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground rounded-md p-1 hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-2">
              {links.map((link) => (
                <Link
                  key={link.slug}
                  href={`/support/${link.slug}`}
                  className="block px-3 py-2.5 text-sm rounded-xl border border-transparent hover:border-brand-border hover:bg-brand-glass transition-colors"
                  onClick={() => setOpen(false)}
                >
                  {link.title}
                </Link>
              ))}
              <div className="border-t border-border mt-2 pt-2">
                <Link
                  href={csHref}
                  className="flex items-center gap-2 px-3 py-2.5 text-sm text-primary rounded-xl border border-brand-border bg-brand-glass hover:bg-brand-glass-heavy transition-colors font-medium"
                  onClick={() => setOpen(false)}
                >
                  <MessageCircle className="h-4 w-4" />
                  Tanya Virtual CS
                </Link>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
