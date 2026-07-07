'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, X } from 'lucide-react';

interface CameraCaptureProps {
  onCapture: (file: File) => void;
  onRemove?: () => void;
  disabled?: boolean;
  previewUrl?: string | null;
}

export function CameraCapture({ onCapture, onRemove, disabled, previewUrl }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [capturedPreview, setCapturedPreview] = useState<string | null>(previewUrl || null);
  const [error, setError] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraOpen(false);
  }, []);

  const startCamera = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsCameraOpen(true);
    } catch {
      setError('Tidak bisa mengakses kamera. Pastikan izin kamera diizinkan.');
    }
  }, []);

  const capture = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `production-photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
      setCapturedPreview(URL.createObjectURL(blob));
      onCapture(file);
      stopCamera();
    }, 'image/jpeg', 0.85);
  }, [onCapture, stopCamera]);

  const handleRemove = useCallback(() => {
    setCapturedPreview(null);
    onRemove?.();
  }, [onRemove]);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  // Show preview if photo already captured
  if (capturedPreview) {
    return (
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={capturedPreview} alt="Foto hasil produksi" className="w-full rounded-lg border-2 border-emerald-500/30" />
        {!disabled && (
          <Button
            type="button"
            variant="destructive"
            size="icon"
            className="absolute top-2 right-2 h-8 w-8"
            onClick={handleRemove}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    );
  }

  // Camera view
  if (isCameraOpen) {
    return (
      <div className="space-y-3">
        { }
        <video ref={videoRef} autoPlay playsInline muted className="w-full rounded-lg border-2 border-muted bg-black" />
        <canvas ref={canvasRef} className="hidden" />
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1 h-12" onClick={stopCamera}>
            <X className="mr-2 h-4 w-4" /> Batal
          </Button>
          <Button type="button" className="flex-1 h-12 bg-emerald-600 hover:bg-emerald-700" onClick={capture}>
            <Camera className="mr-2 h-4 w-4" /> Ambil Foto
          </Button>
        </div>
      </div>
    );
  }

  // Idle state — button to open camera
  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        className="w-full h-16 border-2 border-dashed text-muted-foreground"
        onClick={startCamera}
        disabled={disabled}
      >
        <Camera className="mr-2 h-5 w-5" />
        Ambil Foto (Opsional)
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
