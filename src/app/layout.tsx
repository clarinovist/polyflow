import type { Metadata } from "next";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/layout/theme-provider";
import "./globals.css";

// Temporarily disabled due to build environment connection issues
/*
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});
*/

const geistSans = { variable: "font-sans" };
const geistMono = { variable: "font-mono" };

export const metadata: Metadata = {
    title: "PolyFlow ERP",
    description: "Advanced Plastic Converting ERP System",
    icons: {
        icon: [
            { url: "/polyflow-icon.svg", type: "image/svg+xml" },
        ],
    },
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
                        {children}
                        <AutoChangelogBanner />
                        <Toaster position="bottom-right" richColors />
                        <SessionTimeoutHandler />
                    </ThemeProvider>
                </SessionProvider>
            </body>
        </html>
    );
}
