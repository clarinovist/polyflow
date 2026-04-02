'use client';

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { MessageCircleHeart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { PolyflowChatPanel } from '@/components/support/polyflow-chat-panel';

const HIDDEN_PATH_PREFIXES = ['/login', '/register', '/admin-login', '/kiosk'];
const ENABLED_PATH_PREFIXES = ['/dashboard', '/warehouse', '/production', '/sales', '/finance', '/planning', '/support'];

export function PolyflowChatWidget() {
  const pathname = usePathname();

  const shouldHide = useMemo(() => {
    if (!pathname) return true;
    if (HIDDEN_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true;
    return !ENABLED_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  }, [pathname]);

  if (shouldHide) {
    return null;
  }

  return (
    <div className="fixed bottom-5 right-5 z-50">
      <Dialog>
        <DialogTrigger asChild>
          <Button
            size="lg"
            className="group h-14 rounded-full bg-gradient-to-r from-cyan-600 via-teal-600 to-emerald-600 px-5 text-white shadow-[0_20px_45px_-20px_rgba(13,148,136,0.85)] transition hover:scale-[1.02] hover:from-cyan-500 hover:to-emerald-500"
          >
            <MessageCircleHeart className="mr-2 h-5 w-5 transition group-hover:rotate-6" />
            Butuh bantuan?
          </Button>
        </DialogTrigger>

        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-[860px] border-0 bg-transparent p-0 shadow-none sm:max-h-[90vh]" showCloseButton={false}>
          <DialogHeader className="sr-only">
            <DialogTitle>Virtual CS Polyflow</DialogTitle>
          </DialogHeader>
          <PolyflowChatPanel />
        </DialogContent>
      </Dialog>
    </div>
  );
}
