'use client';

import { useState } from 'react';
import { ExternalLink, Loader2, Send } from 'lucide-react';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type LinkTokenResponse = {
    startUrl?: string;
    expiresAt?: string;
    error?: string;
};

export function TelegramAssistantIntegration({
    authMode = 'LOCAL',
}: {
    authMode?: 'LOCAL' | 'CENTRAL';
}) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string>();
    const [link, setLink] = useState<{ startUrl: string; expiresAt: string }>();

    const createLink = async () => {
        setLoading(true);
        setError(undefined);
        setLink(undefined);
        try {
            const response = await fetch('/api/integrations/telegram/link-token', {
                method: 'POST',
                cache: 'no-store',
                headers: { Accept: 'application/json' },
            });
            const body = (await response.json().catch(() => ({}))) as LinkTokenResponse;
            if (
                !response.ok ||
                !body.startUrl ||
                !body.expiresAt ||
                !body.startUrl.startsWith('https://')
            ) {
                throw new Error(body.error || 'Integrasi Telegram belum tersedia.');
            }
            setLink({ startUrl: body.startUrl, expiresAt: body.expiresAt });
        } catch (requestError) {
            setError(
                requestError instanceof Error
                    ? requestError.message
                    : 'Integrasi Telegram belum tersedia.',
            );
        } finally {
            setLoading(false);
        }
    };

    if (authMode !== 'CENTRAL') {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Asisten Telegram</CardTitle>
                    <CardDescription>
                        Integrasi ini memerlukan akun pusat CENTRAL.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground">
                        Akun LOCAL belum didukung. Masuk dengan akun pusat untuk
                        menautkan Telegram.
                    </p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Asisten Telegram</CardTitle>
                <CardDescription>
                    Tautkan akun pusat untuk bertanya secara read-only pada
                    workspace yang Anda pilih.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <Button
                    type="button"
                    className="min-h-11 w-full sm:w-auto"
                    disabled={loading}
                    onClick={() => void createLink()}
                >
                    {loading ? (
                        <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                        <Send aria-hidden="true" className="mr-2 h-4 w-4" />
                    )}
                    {loading ? 'Menyiapkan tautan…' : 'Tautkan Telegram'}
                </Button>
                <div aria-live="polite" aria-atomic="true">
                    {error ? (
                        <p
                            role="alert"
                            className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
                        >
                            {error}
                        </p>
                    ) : null}
                    {link ? (
                        <div className="space-y-3 rounded-lg border bg-muted/40 p-3">
                            <p className="text-sm text-muted-foreground">
                                Tautan sekali pakai aktif hingga{' '}
                                <time dateTime={link.expiresAt}>
                                    {new Date(link.expiresAt).toLocaleString('id-ID')}
                                </time>
                                .
                            </p>
                            <Button asChild className="min-h-11 w-full sm:w-auto">
                                <a
                                    href={link.startUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    Buka Asisten Telegram
                                    <ExternalLink
                                        aria-hidden="true"
                                        className="ml-2 h-4 w-4"
                                    />
                                </a>
                            </Button>
                        </div>
                    ) : null}
                </div>
            </CardContent>
        </Card>
    );
}
