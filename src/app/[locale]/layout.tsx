import type { Metadata } from "next";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/theme-provider";
import "../globals.css";
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';

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

export default async function RootLayout({
  children,
  params
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <NextIntlClientProvider messages={messages}>
          <SessionProvider>
            <ThemeProvider>
              {children}
              <Toaster position="bottom-right" richColors />
              <SessionTimeoutHandler />
            </ThemeProvider>
          </SessionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
