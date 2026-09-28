'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter,
    DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

export interface GoogleInvitation {
    invitationId: string;
    invitationUrl: string;
    expiresAt: Date | string;
    recipient: { id: string; name: string | null; email: string };
    tenant: { name: string; origin: string };
}

/** Tokens live only in the owning UsersTab state, never browser storage. */
export function GoogleInvitationDialog({
    invitation,
    onClose,
    onAfterClose,
}: {
    invitation: GoogleInvitation;
    onClose: () => void;
    onAfterClose?: () => void;
}) {
    const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
    const [copying, setCopying] = useState(false);
    const copy = async () => {
        setCopying(true);
        try {
            await navigator.clipboard.writeText(invitation.invitationUrl);
            setCopyStatus('copied');
        } catch {
            setCopyStatus('failed');
        } finally {
            setCopying(false);
        }
    };

    return (
        <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent className="sm:max-w-xl" onCloseAutoFocus={onAfterClose ? (event) => {
                event.preventDefault();
                onAfterClose();
            } : undefined}>
                <DialogHeader>
                    <DialogTitle>Undangan login Google</DialogTitle>
                    <DialogDescription>
                        Kirim tautan secara privat kepada penerima di bawah.
                        Undangan tidak dikirim otomatis melalui email.
                    </DialogDescription>
                </DialogHeader>
                <dl className="grid gap-3 rounded-lg border bg-muted/40 p-4 text-sm">
                    <div>
                        <dt className="text-muted-foreground">Penerima</dt>
                        <dd className="break-words font-medium">{invitation.recipient.name || 'Pengguna'}</dd>
                        <dd className="break-all">{invitation.recipient.email}</dd>
                    </div>
                    <div>
                        <dt className="text-muted-foreground">Perusahaan</dt>
                        <dd className="break-words font-medium">{invitation.tenant.name}</dd>
                        <dd className="break-all text-muted-foreground">{invitation.tenant.origin}</dd>
                    </div>
                    <div>
                        <dt className="text-muted-foreground">Berlaku sampai</dt>
                        <dd>{new Date(invitation.expiresAt).toLocaleString('id-ID', {
                            dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Jakarta',
                        })} WIB</dd>
                    </div>
                </dl>
                <div className="grid gap-2">
                    <Label htmlFor="google-invitation-url">Tautan undangan</Label>
                    <textarea
                        id="google-invitation-url"
                        readOnly
                        autoComplete="off"
                        spellCheck={false}
                        value={invitation.invitationUrl}
                        onFocus={(event) => event.currentTarget.select()}
                        onClick={(event) => event.currentTarget.select()}
                        aria-describedby="google-invitation-help"
                        className="min-h-24 w-full resize-none rounded-md border border-input bg-background p-3 font-mono text-sm selection:bg-primary selection:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <p id="google-invitation-help" className="text-sm text-muted-foreground">
                        Penerima harus memilih akun Google dengan email yang tercantum di atas.
                        Tautan dapat dibuka lagi selama tab Pengguna ini belum dimuat ulang atau ditinggalkan.
                        Setelah itu, gunakan Buat ulang undangan jika tautan belum disalin.
                    </p>
                    <p role="status" aria-live="polite" className="text-sm">
                        {copyStatus === 'copied' && 'Tautan tersalin. Kirim secara privat kepada penerima.'}
                        {copyStatus === 'failed' && 'Tidak dapat menyalin otomatis. Pilih teks tautan di atas, lalu salin secara manual.'}
                    </p>
                </div>
                <DialogFooter>
                    <Button variant="outline" className="min-h-11" onClick={onClose}>Tutup</Button>
                    <Button className="min-h-11" onClick={copy} disabled={copying}>
                        {copyStatus === 'copied' ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                        {copyStatus === 'copied' ? 'Salin lagi' : 'Salin tautan'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
