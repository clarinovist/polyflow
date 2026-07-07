'use client';

import { useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, X } from 'lucide-react';

interface CameraCaptureProps {
  onCapture: (file: File) => void;
  onRemove?: () => void;
  disabled?: boolean;
  previewUrl?: string | null;
}

export function CameraCapture({ onCapture, onRemove, disabled, previewUrl }: CameraCaptureProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [capturedPreview, setCapturedPreview] = useState<string | null>(previewUrl || null);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setCapturedPreview(URL.createObjectURL(file));
      onCapture(file);

      // Reset input so same file can be selected again
      e.target.value = '';
    },
    [onCapture],
  );

  const handleRemove = useCallback(() => {
    setCapturedPreview(null);
    onRemove?.();
  }, [onRemove]);

  const openCamera = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Show preview if photo already captured
  if (capturedPreview) {
    return (
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={capturedPreview} alt="Foto hasil produksi" className="w-full max-h-64 object-contain rounded-lg border-2 border-emerald-500/30" />
        {!disabled && (
          <div className="flex gap-2 mt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={openCamera}
            >
              <Camera className="mr-2 h-4 w-4" /> Ambil Ulang
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="flex-1"
              onClick={handleRemove}
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
        onChange={handleFileChange}
        className="hidden"
      />
      <Button
        type="button"
        variant="outline"
        className="w-full h-16 border-2 border-dashed text-muted-foreground"
        onClick={openCamera}
        disabled={disabled}
      >
        <Camera className="mr-2 h-5 w-5" />
        Ambil Foto (Opsional)
      </Button>
    </div>
  );
}
