"use client";

import { Monitor } from "lucide-react";
import { useSession } from "next-auth/react";
import { isMobileBypassAllowed } from "@/lib/mobile/mobile-access-policy";

export function SwitchToDesktopButton() {
  const { data: session } = useSession();
  const user = session?.user as { role?: string; roles?: string[] } | undefined;
  const isAdmin = isMobileBypassAllowed(user);

  if (!isAdmin) return null;

  const handleSwitch = () => {
    if (typeof document !== "undefined") {
      // Set the cookie to bypass mobile redirection for 24 hours
      document.cookie = "bypass_mobile=true; path=/; max-age=86400";
      window.location.href = "/dashboard";
    }
  };

  return (
    <button
      onClick={handleSwitch}
      type="button"
      className="w-full text-left flex items-center justify-between p-4 border border-border bg-card rounded-xl active:scale-[0.98] transition-all hover:bg-accent/50"
    >
      <div className="flex items-center gap-3">
        <Monitor className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="font-semibold text-foreground">💡 Lihat Versi Desktop</p>
          <p className="text-xs text-muted-foreground mt-0.5">Buka dashboard lengkap versi komputer</p>
        </div>
      </div>
    </button>
  );
}
