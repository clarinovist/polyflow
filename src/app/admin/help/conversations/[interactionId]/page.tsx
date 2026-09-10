import { getHelpConversationDetail } from '@/actions/admin/help-admin';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function ConversationDetailPage({
    params,
    searchParams,
}: {
    params: Promise<{ interactionId: string }>;
    searchParams: Promise<{ page?: string }>;
}) {
    const [{ interactionId }, query] = await Promise.all([params, searchParams]);
    const page = Math.max(1, Number(query.page) || 1);
    const result = await getHelpConversationDetail(interactionId, {
        page,
        limit: 50,
    });

    if (result.status !== 'OK') {
        return (
            <div className="space-y-4">
                <Link href="/admin/help/conversations">
                    <Button variant="outline" size="sm">
                        ← Conversations
                    </Button>
                </Link>
                <Card>
                    <CardContent className="py-12 text-center">
                        <h1 className="text-lg font-semibold">
                            Thread tidak tersedia
                        </h1>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Tenant mungkin tidak aktif, percakapan tidak cocok,
                            atau riwayat belum tersimpan. Tidak ada database lain
                            yang dicoba sebagai fallback.
                        </p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const { data } = result;
    const totalPages = Math.ceil(data.total / data.limit);

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold">Conversation thread</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Tampilan terotorisasi dan teredaksi. Pesan dengan panjang
                        4.000 karakter mungkin terpotong saat penyimpanan.
                    </p>
                </div>
                <Link href="/admin/help/conversations">
                    <Button variant="outline" size="sm">
                        ← Conversations
                    </Button>
                </Link>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                        <Badge>{data.interaction.outcome}</Badge>
                        <Badge variant="outline">
                            {data.conversation.channel}
                        </Badge>
                        <span className="font-mono text-xs text-muted-foreground">
                            {data.conversation.id.slice(0, 12)}
                        </span>
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                    <p>
                        <strong>Pertanyaan tercatat:</strong>{' '}
                        {data.interaction.question}
                    </p>
                    {data.interaction.citedSlugs.length > 0 && (
                        <p className="text-muted-foreground">
                            Citation:{' '}
                            {data.interaction.citedSlugs.join(', ')}
                        </p>
                    )}
                </CardContent>
            </Card>

            <section className="space-y-3" aria-label="Pesan percakapan">
                {data.messages.length === 0 ? (
                    <Card>
                        <CardContent className="py-10 text-center text-sm text-muted-foreground">
                            Belum ada pesan tersimpan pada halaman ini.
                        </CardContent>
                    </Card>
                ) : (
                    data.messages.map((message) => (
                        <Card key={message.id}>
                            <CardContent className="py-4">
                                <div className="mb-2 flex items-center justify-between gap-3">
                                    <Badge variant="outline">
                                        {message.role}
                                    </Badge>
                                    <time className="text-xs text-muted-foreground">
                                        {new Date(
                                            message.createdAt,
                                        ).toLocaleString('id-ID')}
                                    </time>
                                </div>
                                <p className="whitespace-pre-wrap break-words text-sm">
                                    {message.content}
                                </p>
                                {message.storageMayBeTruncated && (
                                    <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                                        Pesan mencapai batas penyimpanan dan mungkin
                                        terpotong.
                                    </p>
                                )}
                            </CardContent>
                        </Card>
                    ))
                )}
            </section>

            {data.tools.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">
                            Ringkasan tool (tanpa payload mentah)
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                        {data.tools.map((tool, index) => (
                            <div
                                key={`${tool.name}-${tool.createdAt.toISOString()}-${index}`}
                                className="flex flex-wrap items-center gap-2"
                            >
                                <code>{tool.name}</code>
                                <Badge variant="outline">{tool.outcome}</Badge>
                                <span className="text-xs text-muted-foreground">
                                    {tool.allowed ? 'allowed' : 'denied'} ·{' '}
                                    {new Date(tool.createdAt).toLocaleString(
                                        'id-ID',
                                    )}
                                </span>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            )}

            {totalPages > 1 && (
                <nav className="flex justify-center gap-2" aria-label="Pagination">
                    {page > 1 && (
                        <Link
                            className="rounded-md border px-3 py-1.5 text-sm"
                            href={`/admin/help/conversations/${interactionId}?page=${page - 1}`}
                        >
                            Sebelumnya
                        </Link>
                    )}
                    <span className="px-3 py-1.5 text-sm text-muted-foreground">
                        {page} / {totalPages}
                    </span>
                    {page < totalPages && (
                        <Link
                            className="rounded-md border px-3 py-1.5 text-sm"
                            href={`/admin/help/conversations/${interactionId}?page=${page + 1}`}
                        >
                            Berikutnya
                        </Link>
                    )}
                </nav>
            )}
        </div>
    );
}
