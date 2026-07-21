"use client";

import { useCallback, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils/utils";

interface PullToRefreshProps {
  onRefresh: () => void | Promise<void>;
  children: React.ReactNode;
  className?: string;
  /** Distance in px to pull down before triggering refresh. Default 70. */
  threshold?: number;
}

/**
 * Lightweight pull-to-refresh wrapper for mobile scroll containers.
 * No external lib — touch events only, active when scrollTop is at 0.
 */
export function PullToRefresh({ onRefresh, children, className, threshold = 70 }: PullToRefreshProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const startY = useRef<number | null>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (containerRef.current && containerRef.current.scrollTop <= 0) {
      startY.current = e.touches[0].clientY;
    } else {
      startY.current = null;
    }
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (startY.current === null || refreshing) return;
      const delta = e.touches[0].clientY - startY.current;
      if (delta > 0 && containerRef.current && containerRef.current.scrollTop <= 0) {
        setPullDistance(Math.min(delta * 0.5, threshold * 1.5));
      }
    },
    [refreshing, threshold],
  );

  const handleTouchEnd = useCallback(async () => {
    if (pullDistance >= threshold && !refreshing) {
      setRefreshing(true);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
      }
    }
    setPullDistance(0);
    startY.current = null;
  }, [onRefresh, pullDistance, refreshing, threshold]);

  const showIndicator = pullDistance > 0 || refreshing;

  return (
    <div
      ref={containerRef}
      className={cn("relative overflow-y-auto", className)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={() => void handleTouchEnd()}
    >
      {showIndicator && (
        <div
          className="flex items-center justify-center overflow-hidden transition-all"
          style={{ height: refreshing ? 40 : pullDistance }}
        >
          <RefreshCw
            className={cn(
              "h-5 w-5 text-muted-foreground",
              refreshing && "animate-spin",
            )}
            style={!refreshing ? { transform: `rotate(${pullDistance * 3}deg)` } : undefined}
          />
        </div>
      )}
      <div style={{ transform: refreshing ? "translateY(0)" : undefined }}>{children}</div>
    </div>
  );
}
