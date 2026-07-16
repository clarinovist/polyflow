/**
 * Client-side image compression for kiosk selfies / evidence photos.
 * Resizes so the longest side is maxSide, then JPEG-encodes at quality.
 */

export interface CompressImageOptions {
  maxSide?: number;
  quality?: number;
  /** Output MIME type. Default image/jpeg. */
  mimeType?: "image/jpeg" | "image/webp";
  fileName?: string;
}

function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Gagal memuat gambar"));
    };
    img.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Gagal mengompres gambar"));
          return;
        }
        resolve(blob);
      },
      mimeType,
      quality,
    );
  });
}

/**
 * Compress an image Blob/File for upload. Always returns a File.
 */
export async function compressImageBlob(
  input: Blob,
  opts: CompressImageOptions = {},
): Promise<File> {
  const maxSide = opts.maxSide ?? 720;
  const quality = opts.quality ?? 0.7;
  const mimeType = opts.mimeType ?? "image/jpeg";
  const ext = mimeType === "image/webp" ? "webp" : "jpg";
  const fileName = opts.fileName ?? `selfie-${Date.now()}.${ext}`;

  const img = await loadImageFromBlob(input);
  const { naturalWidth: w, naturalHeight: h } = img;
  if (w <= 0 || h <= 0) {
    throw new Error("Dimensi gambar tidak valid");
  }

  const scale = Math.min(1, maxSide / Math.max(w, h));
  const targetW = Math.max(1, Math.round(w * scale));
  const targetH = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas tidak didukung di browser ini");
  }
  ctx.drawImage(img, 0, 0, targetW, targetH);

  const blob = await canvasToBlob(canvas, mimeType, quality);
  return new File([blob], fileName, { type: mimeType });
}

/**
 * Compress image for upload with safe fallback to the original file.
 * Non-image files are returned unchanged.
 * Default: max side 1280px, JPEG quality 0.75 (delivery / production / vehicle evidence).
 */
export async function compressImageForUpload(
  file: File,
  opts: CompressImageOptions = {},
): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    return await compressImageBlob(file, {
      maxSide: opts.maxSide ?? 1280,
      quality: opts.quality ?? 0.75,
      mimeType: opts.mimeType ?? "image/jpeg",
      fileName: opts.fileName ?? `upload-${Date.now()}.jpg`,
    });
  } catch {
    return file;
  }
}

/** Read a File as a data URL (e.g. offline visit logs). */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Gagal membaca file"));
    };
    reader.onerror = () => reject(new Error("Gagal membaca file"));
    reader.readAsDataURL(file);
  });
}
