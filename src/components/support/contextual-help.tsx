'use client';

import { useState } from 'react';
import { HelpCircle, MessageCircle, X } from 'lucide-react';
import Link from 'next/link';

interface ContextualHelpLink {
  title: string;
  slug: string;
}

interface ContextualHelpProps {
  links: ContextualHelpLink[];
  title?: string;
}

export function ContextualHelp({ links, title = 'Butuh bantuan?' }: ContextualHelpProps) {
  const [open, setOpen] = useState(false);

  if (!links.length) return null;

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        title={title}
      >
        <HelpCircle className="h-4 w-4" />
        <span className="hidden sm:inline">{title}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-50 w-72 rounded-xl border border-border bg-card shadow-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/50">
              <span className="text-sm font-semibold">Panduan Terkait</span>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-2">
              {links.map((link) => (
                <Link
                  key={link.slug}
                  href={`/support/${link.slug}`}
                  className="block px-3 py-2 text-sm rounded-lg hover:bg-muted transition-colors"
                  onClick={() => setOpen(false)}
                >
                  {link.title}
                </Link>
              ))}
              <div className="border-t border-border mt-2 pt-2">
                <Link
                  href="/support?tab=cs"
                  className="flex items-center gap-2 px-3 py-2 text-sm text-primary rounded-lg hover:bg-muted transition-colors"
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
