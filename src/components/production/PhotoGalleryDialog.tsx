"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, ChevronLeft, ChevronRight, X } from "lucide-react";
import { formatWIB } from "@/lib/utils/timezone";

interface PhotoExecution {
  id: string;
  photoUrl: string | null;
  quantityProduced: number;
  endTime: string | null;
  notes: string | null;
}

interface PhotoGalleryDialogProps {
  executions: PhotoExecution[];
  orderNumber: string;
}

export function PhotoGalleryDialog({ executions, orderNumber }: PhotoGalleryDialogProps) {
  const [selectedPhoto, setSelectedPhoto] = useState<number | null>(null);

  // Filter only executions with photos
  const photosWithExec = executions.filter((e) => e.photoUrl);

  if (photosWithExec.length === 0) return null;

  const handlePrevious = () => {
    setSelectedPhoto((prev) =>
      prev !== null && prev > 0 ? prev - 1 : photosWithExec.length - 1
    );
  };

  const handleNext = () => {
    setSelectedPhoto((prev) =>
      prev !== null && prev < photosWithExec.length - 1 ? prev + 1 : 0
    );
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5"
          title="Lihat foto dokumentasi"
        >
          <Camera className="h-4 w-4 text-emerald-600" />
          <span className="text-xs">{photosWithExec.length}</span>
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5 text-emerald-600" />
            Dokumentasi Output — {orderNumber}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto p-4">
          {/* Photo Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {photosWithExec.map((exec, index) => (
              <div
                key={exec.id}
                className="relative group cursor-pointer rounded-lg overflow-hidden border bg-muted"
                onClick={() => setSelectedPhoto(index)}
              >
                {/* Photo */}
                <div className="aspect-square">
                  <img
                    src={exec.photoUrl!}
                    alt={`Output ${index + 1}`}
                    className="w-full h-full object-cover transition-transform group-hover:scale-105"
                    loading="lazy"
                  />
                </div>

                {/* Info Overlay */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                  <div className="text-white font-bold text-lg">
                    {Number(exec.quantityProduced).toLocaleString()} KG
                  </div>
                  <div className="text-white/80 text-xs">
                    {exec.endTime ? formatWIB(exec.endTime, "DD MMM HH:mm") : "-"}
                  </div>
                  {exec.notes && (
                    <div className="text-white/60 text-xs truncate mt-1">
                      {exec.notes}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Total */}
          <div className="mt-6 p-4 bg-muted rounded-lg">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">
                Total {photosWithExec.length} foto dokumentasi
              </span>
              <span className="text-xl font-bold text-emerald-600">
                {photosWithExec
                  .reduce((sum, e) => sum + e.quantityProduced, 0)
                  .toLocaleString()}{" "}
                KG
              </span>
            </div>
          </div>
        </div>

        {/* Lightbox */}
        {selectedPhoto !== null && (
          <LightboxPreview
            photos={photosWithExec}
            currentIndex={selectedPhoto}
            onClose={() => setSelectedPhoto(null)}
            onPrevious={handlePrevious}
            onNext={handleNext}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function LightboxPreview({
  photos,
  currentIndex,
  onClose,
  onPrevious,
  onNext,
}: {
  photos: PhotoExecution[];
  currentIndex: number;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const current = photos[currentIndex];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
      onClick={onClose}
    >
      {/* Close */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-4 right-4 text-white hover:bg-white/20 z-10"
        onClick={onClose}
      >
        <X className="h-6 w-6" />
      </Button>

      {/* Prev */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute left-4 text-white hover:bg-white/20 z-10"
        onClick={(e) => {
          e.stopPropagation();
          onPrevious();
        }}
      >
        <ChevronLeft className="h-8 w-8" />
      </Button>

      {/* Next */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-4 text-white hover:bg-white/20 z-10"
        onClick={(e) => {
          e.stopPropagation();
          onNext();
        }}
      >
        <ChevronRight className="h-8 w-8" />
      </Button>

      {/* Image */}
      <div
        className="max-w-4xl max-h-[80vh] relative"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={current.photoUrl!}
          alt={`Output ${currentIndex + 1}`}
          className="max-w-full max-h-[80vh] object-contain"
        />

        {/* Info */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6">
          <div className="text-white text-2xl font-bold">
            {Number(current.quantityProduced).toLocaleString()} KG
          </div>
          <div className="text-white/80 text-sm">
            {current.endTime ? formatWIB(current.endTime, "DD MMMM YYYY HH:mm") : "-"}
          </div>
          {current.notes && (
            <div className="text-white/60 text-sm mt-2">{current.notes}</div>
          )}
          <div className="text-white/40 text-xs mt-2">
            {currentIndex + 1} / {photos.length}
          </div>
        </div>
      </div>
    </div>
  );
}
