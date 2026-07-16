'use client';

import { useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, X, Loader2 } from 'lucide-react';
import { compressImageForUpload } from '@/lib/media/compress-image';

interface CameraCaptureProps {
  onCapture: (file: File) => void;
  onRemove?: () => void;
  disabled?: boolean;
  previewUrl?: string | null;
  /** Longest side after compress. Default 1280 (production evidence). */
  maxSide?: number;
  /** JPEG quality 0–1. Default 0.75. */
  quality?: number;
  buttonLabel?: string;
}

export function CameraCapture({
  onCapture,
  onRemove,
  disabled,
  previewUrl,
  maxSide = 1280,
  quality = 0.75,
  buttonLabel = 'Ambil Foto (Opsional)',
}: CameraCaptureProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [capturedPreview, setCapturedPreview] = useState<string | null>(previewUrl || null);
  const [compressing, setCompressing] = useState(false);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setCompressing(true);
      try {
        const out = await compressImageForUpload(file, {
          maxSide,
          quality,
          mimeType: 'image/jpeg',
          fileName: `capture-${Date.now()}.jpg`,
        });

        if (capturedPreview?.startsWith('blob:')) {
          URL.revokeObjectURL(capturedPreview);
        }
        setCapturedPreview(URL.createObjectURL(out));
        onCapture(out);
      } finally {
        setCompressing(false);
        // Reset input so same file can be selected again
        e.target.value = '';
      }
    },
    [capturedPreview, maxSide, onCapture, quality],
  );

  const handleRemove = useCallback(() => {
    if (capturedPreview?.startsWith('blob:')) {
      URL.revokeObjectURL(capturedPreview);
    }
    setCapturedPreview(null);
    onRemove?.();
  }, [capturedPreview, onRemove]);

  const openCamera = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Show preview if photo already captured
  if (capturedPreview) {
    return (
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={capturedPreview}
          alt="Foto hasil produksi"
          className="w-full max-h-64 object-contain rounded-lg border-2 border-emerald-500/30"
        />
        {!disabled && (
          <div className="flex gap-2 mt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={openCamera}
              disabled={compressing}
            >
              {compressing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Camera className="mr-2 h-4 w-4" />
              )}
              Ambil Ulang
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="flex-1"
              onClick={handleRemove}
              disabled={compressing}
            >
              <X className="mr-2 h-4 w-4" /> Hapus
            </Button>
          </div>
        )}
      </div>
    );
  }

  // Idle state — hidden file input + visible button
  return (
    <div className="space-y-2">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => void handleFileChange(e)}
        className="hidden"
        disabled={disabled || compressing}
      />
      <Button
        type="button"
        variant="outline"
        className="w-full h-16 border-2 border-dashed text-muted-foreground"
        onClick={openCamera}
        disabled={disabled || compressing}
      >
        {compressing ? (
          <>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Mengompres foto…
          </>
        ) : (
          <>
            <Camera className="mr-2 h-5 w-5" />
            {buttonLabel}
          </>
        )}
      </Button>
    </div>
  );
}
