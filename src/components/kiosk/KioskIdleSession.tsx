'use client';

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";

interface UseKioskIdleSessionOptions {
  timeoutMs?: number;
  warningMs?: number;
  onIdle?: () => void;
}

export function useKioskIdleSession({
  timeoutMs = 15 * 60 * 1000, // 15 minutes
  warningMs = 60 * 1000, // 60 seconds before logout
  onIdle,
}: UseKioskIdleSessionOptions = {}) {
  const [showWarning, setShowWarning] = useState(false);
  const [timeLeft, setTimeLeft] = useState(warningMs / 1000);
  const [lastActivity, setLastActivity] = useState(Date.now());

  const resetTimer = useCallback(() => {
    setLastActivity(Date.now());
    setShowWarning(false);
    setTimeLeft(warningMs / 1000);
  }, [warningMs]);

  // Track user activity
  useEffect(() => {
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    const handler = () => resetTimer();

    events.forEach(event => window.addEventListener(event, handler, { passive: true }));
    return () => events.forEach(event => window.removeEventListener(event, handler));
  }, [resetTimer]);

  // Main idle timer
  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Date.now() - lastActivity;
      const remaining = timeoutMs - elapsed;

      if (remaining <= 0) {
        clearInterval(interval);
        onIdle?.();
        return;
      }

      if (remaining <= warningMs && !showWarning) {
        setShowWarning(true);
        setTimeLeft(Math.ceil(remaining / 1000));
      }

      if (showWarning) {
        setTimeLeft(Math.ceil(remaining / 1000));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [lastActivity, timeoutMs, warningMs, showWarning, onIdle]);

  return {
    showWarning,
    timeLeft,
    resetTimer,
    dismissWarning: () => {
      setShowWarning(false);
      resetTimer();
    },
  };
}

interface KioskIdleWarningProps {
  timeLeft: number;
  onDismiss: () => void;
}

export function KioskIdleWarning({ timeLeft, onDismiss }: KioskIdleWarningProps) {
  return (
    <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4">
      <div className="bg-card border-2 border-amber-500 rounded-2xl p-8 max-w-md w-full text-center space-y-4 shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="h-16 w-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto">
          <span className="text-3xl font-black text-amber-600">{timeLeft}</span>
        </div>
        <h2 className="text-2xl font-black">Session Hampir Habis</h2>
        <p className="text-muted-foreground">
          Session akan berakhir dalam {timeLeft} detik karena tidak ada aktivitas.
        </p>
        <Button
          className="w-full h-14 text-lg font-bold"
          onClick={onDismiss}
        >
          Ketuk untuk Lanjut
        </Button>
      </div>
    </div>
  );
}
