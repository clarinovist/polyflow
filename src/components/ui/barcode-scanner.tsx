"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScanLine, AlertCircle, X } from "lucide-react";

// Minimal ambient typing for the native BarcodeDetector API (not yet in
// standard TS lib.dom types on all TS/Next versions).
interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
interface BarcodeDetectorConstructor {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
}

interface BarcodeScannerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the decoded barcode/SKU value. Dialog stays open; caller closes it. */
  onDetected: (value: string) => void;
  title?: string;
}

function getBarcodeDetector(): BarcodeDetectorConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor };
  return w.BarcodeDetector ?? null;
}

/**
 * Camera barcode scanner using the native BarcodeDetector API when available.
 * Falls back to a manual SKU input if the browser doesn't support it or the
 * camera can't be opened (permission denied, no HTTPS, etc).
 */
export function BarcodeScanner({ open, onOpenChange, onDetected, title = "Scan Barcode / SKU" }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualValue, setManualValue] = useState("");
  const [supported, setSupported] = useState<boolean | null>(null);

  const stopStream = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    if (!open) {
      stopStream();
      setError(null);
      setManualValue("");
      return;
    }

    const Detector = getBarcodeDetector();
    if (!Detector) {
      setSupported(false);
      return;
    }
    setSupported(true);

    let cancelled = false;
    const detector = new Detector({ formats: ["ean_13", "ean_8", "code_128", "code_39", "qr_code", "upc_a", "upc_e"] });

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Kamera tidak didukung di browser ini.");
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const scanLoop = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const results = await detector.detect(videoRef.current);
            if (results.length > 0) {
              onDetected(results[0].rawValue);
              return;
            }
          } catch {
            // ignore per-frame decode errors, keep scanning
          }
          rafRef.current = requestAnimationFrame(() => void scanLoop());
        };
        void scanLoop();
      } catch (err) {
        setError(
          err instanceof Error
            ? err.name === "NotAllowedError"
              ? "Izin kamera ditolak. Gunakan input manual di bawah."
              : err.message
            : "Gagal membuka kamera",
        );
      }
    })();

    return () => {
      cancelled = true;
      stopStream();
    };
  }, [open, onDetected, stopStream]);

  const handleManualSubmit = () => {
    if (manualValue.trim()) {
      onDetected(manualValue.trim());
      setManualValue("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="h-5 w-5" />
            {title}
          </DialogTitle>
        </DialogHeader>

        {supported === false || error ? (
          <div className="space-y-3">
            <div className="flex items-start gap-2 text-sm text-muted-foreground bg-muted/50 border rounded-lg p-3">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <p>{error || "Scanner kamera tidak didukung di perangkat ini. Ketik SKU secara manual."}</p>
            </div>
            <div className="flex gap-2">
              <input
                autoFocus
                value={manualValue}
                onChange={(e) => setManualValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleManualSubmit()}
                placeholder="Ketik SKU..."
                className="flex-1 h-11 px-3 border border-input rounded-lg bg-background text-sm outline-none focus:ring-2 focus:ring-primary/20"
              />
              <Button type="button" onClick={handleManualSubmit} disabled={!manualValue.trim()}>
                OK
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border-2 border-dashed border-border bg-black">
              <video ref={videoRef} playsInline muted autoPlay className="h-full w-full object-cover" />
              <div className="absolute inset-x-6 top-1/2 -translate-y-1/2 h-0.5 bg-primary/80" />
            </div>
            <p className="text-xs text-center text-muted-foreground">Arahkan kamera ke barcode / QR produk</p>
            <Button type="button" variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4 mr-2" />
              Tutup
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
