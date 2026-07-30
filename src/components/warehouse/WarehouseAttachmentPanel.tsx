'use client';

import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
    Camera,
    FileText,
    Loader2,
    X,
    ChevronDown,
    ChevronUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { compressImageForUpload } from '@/lib/media/compress-image';
import {
    createWarehouseAttachment,
    deleteWarehouseAttachment,
} from '@/actions/warehouse/operational-attachments';

export type AttachmentCheckpoint = 'LOAD' | 'UNLOAD' | 'DAMAGE' | 'RECEIPT' | 'OPNAME';
export type DocumentType = 'PHOTO' | 'SURAT_JALAN' | 'NOTA_INVOICE' | 'BERITA_ACARA' | 'OTHER';

export interface AttachmentItem {
    id: string;
    checkpoint: string;
    documentType: string;
    url: string;
    originalName?: string | null;
    mimeType?: string | null;
    sizeBytes?: number | null;
    note?: string | null;
    createdAt: string;
    uploadedBy?: { id: string; name: string | null } | null;
}

interface WarehouseAttachmentPanelProps {
    entityId: string;
    entityLabel: string;
    entityType: 'deliveryOrderId' | 'goodsReceiptId' | 'purchaseOrderId' | 'stockOpnameId';
    checkpoint: AttachmentCheckpoint;
    attachments: AttachmentItem[];
    disabled?: boolean;
    onAttachmentChange?: () => void;
}

const DOC_TYPE_LABELS: Record<DocumentType, string> = {
    PHOTO: 'Foto',
    SURAT_JALAN: 'Surat Jalan',
    NOTA_INVOICE: 'Nota/Invoice',
    BERITA_ACARA: 'Berita Acara',
    OTHER: 'Lainnya',
};

const CHECKPOINT_LABELS: Record<AttachmentCheckpoint, string> = {
    LOAD: 'Muat',
    UNLOAD: 'Bongkar',
    DAMAGE: 'Kerusakan',
    RECEIPT: 'Penerimaan',
    OPNAME: 'Opname',
};

const ALLOWED_IMAGE_TYPES = 'image/jpeg,image/png,image/webp';
const ALLOWED_DOC_TYPES = 'image/jpeg,image/png,image/webp,application/pdf';

export function WarehouseAttachmentPanel({
    entityId,
    entityLabel: _entityLabel,
    entityType,
    checkpoint,
    attachments = [],
    disabled = false,
    onAttachmentChange,
}: WarehouseAttachmentPanelProps) {
    const safeAttachments = Array.isArray(attachments) ? attachments : [];
    const [uploading, setUploading] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [note, setNote] = useState('');
    const [expanded, setExpanded] = useState(safeAttachments.length > 0);
    const photoInputRef = useRef<HTMLInputElement>(null);
    const docInputRef = useRef<HTMLInputElement>(null);

    const handleUpload = useCallback(
        async (file: File, docType: DocumentType) => {
            setUploading(true);
            try {
                let uploadFile = file;
                if (docType === 'PHOTO' && file.type.startsWith('image/')) {
                    uploadFile = await compressImageForUpload(file);
                }

                const formData = new FormData();
                formData.append('file', uploadFile);
                formData.append(entityType, entityId);
                formData.append('checkpoint', checkpoint);
                formData.append('documentType', docType);

                const response = await fetch('/api/upload/warehouse-attachment', {
                    method: 'POST',
                    body: formData,
                });

                let result: { key?: string; url?: string; originalName?: string; mimeType?: string; sizeBytes?: number; error?: string };
                try {
                    result = await response.json();
                } catch {
                    toast.error(`Upload gagal (HTTP ${response.status}). Cek koneksi / R2.`);
                    return;
                }
                if (!response.ok || !result.key) {
                    toast.error(result.error || `Upload gagal (HTTP ${response.status})`);
                    return;
                }

                const createAction = await createWarehouseAttachment({
                    [entityType]: entityId,
                    checkpoint,
                    documentType: docType,
                    storageKey: result.key!,
                    url: result.url || '',
                    originalName: result.originalName,
                    mimeType: result.mimeType,
                    sizeBytes: result.sizeBytes,
                    note: note.trim() || undefined,
                });

                if (createAction.success) {
                    toast.success(
                        `${DOC_TYPE_LABELS[docType]} berhasil diupload`,
                    );
                    setNote('');
                    onAttachmentChange?.();
                } else {
                    toast.error(
                        ('error' in createAction ? createAction.error : null) ||
                            'Gagal menyimpan attachment',
                    );
                }
            } catch (err) {
                const msg = err instanceof Error ? err.message : '';
                toast.error(msg ? `Gagal mengunggah file: ${msg}` : 'Gagal mengunggah file. Cek koneksi.');
            } finally {
                setUploading(false);
            }
        },
        [entityId, entityType, checkpoint, note, onAttachmentChange],
    );

    const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleUpload(file, 'PHOTO');
        e.target.value = '';
    };

    const handleDocSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const ext = file.name.split('.').pop()?.toLowerCase();
            const docType =
                ext === 'pdf'
                    ? 'SURAT_JALAN'
                    : file.type.startsWith('image/')
                      ? 'PHOTO'
                      : 'OTHER';
            handleUpload(file, docType);
        }
        e.target.value = '';
    };

    const handleDelete = async (attachmentId: string) => {
        setDeletingId(attachmentId);
        try {
            const result = await deleteWarehouseAttachment(attachmentId);
            if (result.success) {
                toast.success('Bukti dihapus');
                onAttachmentChange?.();
            } else {
                toast.error(
                    ('error' in result ? result.error : null) ||
                        'Gagal menghapus',
                );
            }
        } catch {
            toast.error('Gagal menghapus bukti');
        } finally {
            setDeletingId(null);
        }
    };

    const isImage = (mimeType?: string | null) =>
        mimeType?.startsWith('image/') ?? false;

    return (
        <div className="border rounded-xl p-3 space-y-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Camera className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-sm font-medium">
                        Bukti {CHECKPOINT_LABELS[checkpoint]}
                    </h3>
                    {safeAttachments.length > 0 && (
                        <Badge variant="secondary" className="text-[10px]">
                            {safeAttachments.length}
                        </Badge>
                    )}
                </div>
                <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground">
                        Opsional
                    </span>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => setExpanded(!expanded)}
                    >
                        {expanded ? (
                            <ChevronUp className="h-3 w-3" />
                        ) : (
                            <ChevronDown className="h-3 w-3" />
                        )}
                    </Button>
                </div>
            </div>

            {expanded && (
                <>
                    {/* Existing attachments */}
                    {safeAttachments.length > 0 && (
                        <div className="grid grid-cols-3 gap-2">
                            {safeAttachments.map((att) => (
                                <div
                                    key={att.id}
                                    className="relative group rounded-lg overflow-hidden border bg-muted/30"
                                >
                                    {isImage(att.mimeType) ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={att.url}
                                            alt={
                                                att.originalName ||
                                                'Bukti operasional'
                                            }
                                            className="w-full h-20 object-cover"
                                        />
                                    ) : (
                                        <div className="w-full h-20 flex flex-col items-center justify-center gap-1 text-muted-foreground">
                                            <FileText className="h-6 w-6" />
                                            <span className="text-[9px] truncate max-w-[90%] px-1">
                                                {att.originalName || 'Dokumen'}
                                            </span>
                                        </div>
                                    )}
                                    <div className="absolute bottom-0 inset-x-0 bg-black/60 px-1.5 py-1">
                                        <p className="text-[9px] text-white truncate">
                                            {DOC_TYPE_LABELS[
                                                att.documentType as DocumentType
                                            ] || att.documentType}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleDelete(att.id)}
                                        disabled={deletingId === att.id || disabled}
                                        className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                                    >
                                        {deletingId === att.id ? (
                                            <Loader2 className="h-3 w-3 animate-spin" />
                                        ) : (
                                            <X className="h-3 w-3" />
                                        )}
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Upload controls */}
                    {!disabled && (
                        <div className="space-y-2">
                            <Input
                                placeholder="Catatan (opsional)"
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                className="h-8 text-xs"
                            />
                            <div className="flex gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="flex-1 h-9 text-xs"
                                    disabled={uploading}
                                    onClick={() => photoInputRef.current?.click()}
                                >
                                    {uploading ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                                    ) : (
                                        <Camera className="h-3.5 w-3.5 mr-1" />
                                    )}
                                    Foto
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="flex-1 h-9 text-xs"
                                    disabled={uploading}
                                    onClick={() => docInputRef.current?.click()}
                                >
                                    {uploading ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                                    ) : (
                                        <FileText className="h-3.5 w-3.5 mr-1" />
                                    )}
                                    Dokumen
                                </Button>
                            </div>
                            <p className="text-[10px] text-muted-foreground text-center">
                                Upload foto atau dokumen — bisa dilewati
                            </p>
                        </div>
                    )}

                    {disabled && safeAttachments.length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-2">
                            Tidak ada bukti
                        </p>
                    )}
                </>
            )}

            <input
                ref={photoInputRef}
                type="file"
                accept={ALLOWED_IMAGE_TYPES}
                capture="environment"
                onChange={handlePhotoSelect}
                className="hidden"
            />
            <input
                ref={docInputRef}
                type="file"
                accept={ALLOWED_DOC_TYPES}
                onChange={handleDocSelect}
                className="hidden"
            />
        </div>
    );
}
