"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Monitor } from "lucide-react";
import { desktopRequiredLabels as L } from "@/lib/labels/mobile";
import {
  isMobileBypassAllowed,
  getMobileHomeForUser,
  getMobileHomeCtaKey,
} from "@/lib/mobile/mobile-access-policy";
import { useSession } from "next-auth/react";

export function DesktopRequiredClient() {
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const from = searchParams.get("from");

  const user = session?.user as { role?: string; roles?: string[] } | undefined;
  const bypassAllowed = isMobileBypassAllowed(user);

  const homePath = getMobileHomeForUser(user || {});
  const ctaKey = getMobileHomeCtaKey(user);
  const homeLabel =
    ctaKey === "sales"
      ? L.cta.sales
      : ctaKey === "warehouse"
        ? L.cta.warehouse
        : ctaKey === "production"
          ? L.cta.production
          : L.cta.login;

  const handleBypass = () => {
    if (typeof document !== "undefined") {
      document.cookie = "bypass_mobile=true; path=/; max-age=86400";
      // Redirect to the originally requested page
      if (from) {
        window.location.href = decodeURIComponent(from);
      } else {
        window.location.href = "/dashboard";
      }
    }
  };

  return (
    <div className="min-h-dvh flex items-center justify-center bg-background px-6">
      <div className="max-w-sm w-full text-center space-y-6">
        <div className="flex justify-center">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
            <Monitor className="h-8 w-8 text-muted-foreground" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-bold text-foreground">{L.title}</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">{L.body}</p>
        </div>

        {from && (
          <p className="text-xs text-muted-foreground/60">
            {L.fromPrefix} {from}
          </p>
        )}

        <div className="space-y-3">
          {homePath ? (
            <Link
              href={homePath}
              className="block w-full py-3 px-4 rounded-lg bg-primary text-primary-foreground font-medium text-sm transition-colors hover:bg-primary/90 active:scale-[0.98]"
            >
              {homeLabel}
            </Link>
          ) : (
            <Link
              href="/login"
              className="block w-full py-3 px-4 rounded-lg bg-primary text-primary-foreground font-medium text-sm transition-colors hover:bg-primary/90 active:scale-[0.98]"
            >
              {L.cta.login}
            </Link>
          )}

          {bypassAllowed && (
            <button
              type="button"
              onClick={handleBypass}
              className="block w-full py-3 px-4 rounded-lg border border-border bg-card text-foreground font-medium text-sm transition-colors hover:bg-accent/50 active:scale-[0.98]"
            >
              Buka versi desktop (24 jam)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
