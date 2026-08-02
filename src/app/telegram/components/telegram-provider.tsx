'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData: string;
        initDataUnsafe?: Record<string, unknown>;
        version: string;
        colorScheme: 'light' | 'dark';
        themeParams: Record<string, string>;
        viewportHeight: number;
        isExpanded: boolean;
        platform: string;
        BackButton: { show: () => void; hide: () => void; onClick: (cb: () => void) => void; offClick: (cb: () => void) => void };
        MainButton: { text: string; show: () => void; hide: () => void; setText: (t: string) => void; onClick: (cb: () => void) => void; offClick: (cb: () => void) => void; enable: () => void; disable: () => void };
        HapticFeedback: { impactOccurred: (style: 'light'|'medium'|'heavy'|'rigid'|'soft') => void; notificationOccurred: (type: 'error'|'success'|'warning') => void; selectionChanged: () => void };
        ready: () => void;
        expand: () => void;
        close: () => void;
        setHeaderColor: (color: string) => void;
        setBackgroundColor: (color: string) => void;
        onEvent: (event: string, cb: () => void) => void;
        offEvent: (event: string, cb: () => void) => void;
      };
    };
  }
}

type TelegramContextValue = {
  webApp: Window['Telegram'] extends { WebApp?: infer T } ? T : undefined;
  initData: string;
  theme: 'light' | 'dark';
  themeParams: Record<string, string>;
  isReady: boolean;
  platform: string;
  haptic: (style?: 'light'|'medium'|'heavy') => void;
};

const TelegramContext = createContext<TelegramContextValue | null>(null);

export function TelegramProvider({ children }: { children: React.ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [initData, setInitData] = useState('');
  const [theme, setTheme] = useState<'light'|'dark'>('light');
  const [themeParams, setThemeParams] = useState<Record<string, string>>({});

  useEffect(() => {
    const w = window.Telegram?.WebApp;
    if (!w) {
      setIsReady(true);
      return;
    }
    try {
      w.ready();
      w.expand();
      setInitData(w.initData || '');
      setTheme(w.colorScheme || 'light');
      setThemeParams(w.themeParams || {});
      setIsReady(true);

      const handleThemeChanged = () => {
        setTheme(w.colorScheme || 'light');
        setThemeParams(w.themeParams || {});
      };
      w.onEvent?.('themeChanged', handleThemeChanged);
      return () => {
        try { w.offEvent?.('themeChanged', handleThemeChanged); } catch { /* ignore */ }
      };
    } catch {
      setIsReady(true);
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');

    const tgVarMap: Record<string, string> = {
      bg_color: '--tg-theme-bg-color',
      text_color: '--tg-theme-text-color',
      hint_color: '--tg-theme-hint-color',
      link_color: '--tg-theme-link-color',
      button_color: '--tg-theme-button-color',
      button_text_color: '--tg-theme-button-text-color',
      secondary_bg_color: '--tg-theme-secondary-bg-color',
      header_bg_color: '--tg-theme-header-bg-color',
      accent_text_color: '--tg-theme-accent-text-color',
      section_bg_color: '--tg-theme-section-bg-color',
      section_header_text_color: '--tg-theme-section-header-text-color',
      subtitle_text_color: '--tg-theme-subtitle-text-color',
      destructive_text_color: '--tg-theme-destructive-text-color',
    };

    if (Object.keys(themeParams).length > 0) {
      for (const [tgKey, cssVar] of Object.entries(tgVarMap)) {
        if (themeParams[tgKey]) {
          root.style.setProperty(cssVar, themeParams[tgKey]);
        }
      }
    } else {
      for (const cssVar of Object.values(tgVarMap)) {
        root.style.removeProperty(cssVar);
      }
    }
  }, [theme, themeParams]);

  useEffect(() => {
    if (window.Telegram?.WebApp) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = (dark: boolean) => {
      document.documentElement.classList.toggle('dark', dark);
    };
    apply(mq.matches);
    const handler = (e: MediaQueryListEvent) => apply(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const value = useMemo<TelegramContextValue>(() => {
    const webApp = typeof window !== 'undefined' ? window.Telegram?.WebApp : undefined;
    return {
      webApp: webApp as unknown as undefined,
      initData,
      theme,
      themeParams,
      isReady,
      platform: (webApp?.platform as string) || 'unknown',
      haptic: (style = 'light') => {
        try {
          const w = webApp as unknown as { HapticFeedback?: { impactOccurred: (s: string) => void } } | undefined;
          w?.HapticFeedback?.impactOccurred(style);
        } catch { /* ignore */ }
      },
    };
  }, [initData, theme, themeParams, isReady]);

  return <TelegramContext.Provider value={value}>{children}</TelegramContext.Provider>;
}

export function useTelegram() {
  const ctx = useContext(TelegramContext);
  if (!ctx) throw new Error('useTelegram must be used within TelegramProvider');
  return ctx;
}
