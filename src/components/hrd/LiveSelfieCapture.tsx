'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, RefreshCw, AlertCircle } from 'lucide-react';
import { compressImageBlob } from '@/lib/media/compress-image';
import { cn } from '@/lib/utils/utils';

interface Props {
  /** Called with compressed File after capture (or null when cleared). */
  onCapture: (file: File | null) => void;
  disabled?: boolean;
  className?: string;
  label?: string;
}

/**
 * Live-only selfie capture via getUserMedia.
 * No file input / gallery path — canvas capture from video stream only.
 */
export function LiveSelfieCapture({
  onCapture,
  disabled,
  className,
  label = 'Selfie (wajib)',
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraReady(false);
  }, []);

  const startCamera = useCallback(async () => {
    if (disabled) return;
    setCameraError(null);
    setStarting(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Kamera tidak didukung di browser ini. Gunakan HTTPS / browser modern.');
      }
      stopStream();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'user' },
          width: { ideal: 720 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraReady(true);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.name === 'NotAllowedError'
            ? 'Izin kamera ditolak. Aktifkan kamera di pengaturan browser.'
            : err.message
          : 'Gagal membuka kamera';
      setCameraError(msg);
      setCameraReady(false);
    } finally {
      setStarting(false);
    }
  }, [disabled, stopStream]);

  useEffect(() => {
    void startCamera();
    return () => {
      stopStream();
    };
  }, [startCamera, stopStream]);

  const clearPreview = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    onCapture(null);
  }, [onCapture, previewUrl]);

  const handleCapture = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !cameraReady || disabled) return;
    setCapturing(true);
    setCameraError(null);
    try {
      const w = video.videoWidth || 720;
      const h = video.videoHeight || 720;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas tidak didukung');
      // Mirror selfie horizontally so it matches user expectation
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, w, h);

      const rawBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Gagal ambil foto'))),
          'image/jpeg',
          0.92,
        );
      });

      const file = await compressImageBlob(rawBlob, {
        maxSide: 720,
        quality: 0.7,
        mimeType: 'image/jpeg',
        fileName: `attendance-selfie-${Date.now()}.jpg`,
      });

      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      onCapture(file);
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : 'Gagal ambil selfie');
    } finally {
      setCapturing(false);
    }
  }, [cameraReady, disabled, onCapture, previewUrl]);

  const handleRetake = useCallback(async () => {
    clearPreview();
    if (!cameraReady) {
      await startCamera();
    }
  }, [cameraReady, clearPreview, startCamera]);

  if (previewUrl) {
    return (
      <div className={cn('space-y-2', className)}>
        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
          {label}
        </label>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={previewUrl}
          alt="Selfie absensi"
          className="w-full max-h-56 object-cover rounded-xl border-2 border-emerald-500/40 bg-black"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => void handleRetake()}
          disabled={disabled}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Ambil Ulang
        </Button>
      </div>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
        {label}
      </label>
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border-2 border-dashed border-border bg-black">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="h-full w-full object-cover scale-x-[-1]"
        />
        {!cameraReady && !cameraError && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-white/80 bg-black/50">
            {starting ? 'Membuka kamera…' : 'Menyiapkan kamera…'}
          </div>
        )}
      </div>

      {cameraError && (
        <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-lg p-3">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div className="space-y-2 flex-1">
            <p>{cameraError}</p>
            <Button type="button" size="sm" variant="outline" onClick={() => void startCamera()}>
              Coba Lagi
            </Button>
          </div>
        </div>
      )}

      <Button
        type="button"
        className="w-full h-12 font-bold uppercase"
        onClick={() => void handleCapture()}
        disabled={disabled || !cameraReady || capturing}
      >
        <Camera className="mr-2 h-5 w-5" />
        {capturing ? 'Memproses…' : 'Ambil Selfie'}
      </Button>
    </div>
  );
}
