'use client';

import { useEffect, useState } from 'react';

export function PwaInstallCard() {
  const [canInstall, setCanInstall] = useState(false);
  const [deferred, setDeferred] = useState<Event | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e);
      setCanInstall(true);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    if (window.matchMedia('(display-mode: standalone)').matches) setInstalled(true);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed) return null;

  const install = async () => {
    const d = deferred as unknown as { prompt: () => void; userChoice: Promise<unknown> } | null;
    if (d) {
      d.prompt();
      await d.userChoice;
      setDeferred(null);
      setCanInstall(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 text-sm">
      <p className="font-semibold text-slate-100">Pasang PolyFlow di HP</p>
      <p className="mt-1 text-slate-400">Buka lewat browser HP - bagikan/menu - &quot;Add to Home Screen&quot;. Order &amp; approve jalan 1 layar seperti APK.</p>
      {canInstall && (
        <button onClick={install} className="mt-3 w-full rounded-full bg-blue-600 py-2 text-sm font-semibold text-white">Pasang sekarang</button>
      )}
    </div>
  );
}
