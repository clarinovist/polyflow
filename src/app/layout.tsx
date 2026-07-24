import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { extractSubdomain } from "@/lib/core/subdomain";
import { getCompanyConfigWithOverridesAsync } from "@/lib/config/company-settings";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { SidebarCollapseProvider } from "@/components/layout/sidebar-collapse-context";
import "./globals.css";

const geistSans = { variable: "font-sans" };
const geistMono = { variable: "font-mono" };

export async function generateMetadata(): Promise<Metadata> {
    let tenantTitle = "PolyFlow ERP";
    let tenantName = "";

    try {
        const h = await headers();
        const host = h.get("host") || "";
        const forwarded = h.get("x-forwarded-host") || "";
        const subdomain = extractSubdomain(forwarded || host);

        if (subdomain) {
            const company = await getCompanyConfigWithOverridesAsync().catch(() => null);
            tenantName = company?.name || (subdomain.charAt(0).toUpperCase() + subdomain.slice(1));
            tenantTitle = `${tenantName} — PolyFlow ERP`;
        } else {
            const rawHost = (forwarded || host).split(":")[0].toLowerCase();
            if (rawHost.startsWith("admin.")) {
                tenantTitle = "SuperAdmin — PolyFlow ERP";
            }
        }
    } catch {
        // Fallback to default static title
    }

    return {
        title: {
            default: tenantTitle,
            template: `%s | ${tenantName || "PolyFlow"}`,
        },
        description: "Advanced Plastic Converting ERP System",
        manifest: "/manifest.json",
        icons: {
            icon: [
                { url: "/polyflow-icon.svg", type: "image/svg+xml" },
            ],
            apple: [
                { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
            ],
        },
    };
}

export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    viewportFit: "cover",
    themeColor: "#09090b",
};

import { SessionProvider } from "@/components/auth/SessionProvider";
import SessionTimeoutHandler from "@/components/auth/SessionTimeoutHandler";
import { AutoChangelogBanner } from "@/components/layout/auto-changelog-banner";

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" suppressHydrationWarning>
            <body
                className={`${geistSans.variable} ${geistMono.variable} antialiased`}
                suppressHydrationWarning
            >
                <SessionProvider>
                    <ThemeProvider>
                        <SidebarCollapseProvider>
                            {children}
                            <AutoChangelogBanner />
                            <Toaster position="bottom-right" richColors />
                            <SessionTimeoutHandler />
                        </SidebarCollapseProvider>
                    </ThemeProvider>
                </SessionProvider>
            </body>
        </html>
    );
}
