"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { updateProductionOrder } from "@/actions/production/production";
import { toast } from "sonner";
import { AlertCircle, Loader2, MapPin } from "lucide-react";
import { productionComponentLabels } from "@/lib/labels";
import {
  isInactiveLocation,
  isRiskyOutputLocation,
  type LocationLike,
} from "@/lib/locations/resolve-location";
import { cn } from "@/lib/utils/utils";

type LocationOption = LocationLike & { id: string; name: string; slug: string };

const EDITABLE_STATUSES = new Set([
  "DRAFT",
  "WAITING_MATERIAL",
  "RELEASED",
  "IN_PROGRESS",
]);

export function ReassignOutputLocationButton({
  orderId,
  orderNumber,
  orderStatus,
  currentLocationId,
  currentLocationName,
  locations,
}: {
  orderId: string;
  orderNumber: string;
  orderStatus: string;
  currentLocationId: string;
  currentLocationName: string;
  locations: LocationOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedLocationId, setSelectedLocationId] = useState(currentLocationId);
  const [isPending, setIsPending] = useState(false);

  const canEdit = EDITABLE_STATUSES.has(orderStatus);
  const activeLocations = locations.filter((l) => !isInactiveLocation(l));
  const selected = activeLocations.find((l) => l.id === selectedLocationId);
  const risky = isRiskyOutputLocation(selected);

  const handleSave = async () => {
    if (!selectedLocationId) {
      toast.error("Pilih lokasi output terlebih dahulu");
      return;
    }
    if (selectedLocationId === currentLocationId) {
      onClose();
      return;
    }

    setIsPending(true);
    try {
      const result = await updateProductionOrder({
        id: orderId,
        locationId: selectedLocationId,
      });

      if (result.success) {
        toast.success(productionComponentLabels.outputLocationUpdated);
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error || "Gagal mengubah lokasi output");
      }
    } catch {
      toast.error("Gagal mengubah lokasi output. Silakan coba lagi.");
    } finally {
      setIsPending(false);
    }
  };

  const onClose = () => {
    if (!isPending) {
      setSelectedLocationId(currentLocationId);
      setOpen(false);
    }
  };

  if (!canEdit) {
    return null;
  }

  return (
    <>
      <Button
        size="icon"
        variant="ghost"
        onClick={() => {
          setSelectedLocationId(currentLocationId);
          setOpen(true);
        }}
        className="h-6 w-6 text-muted-foreground hover:text-foreground"
        title={productionComponentLabels.changeOutputLocation}
        id="output-location"
      >
        <MapPin className="h-3 w-3" />
      </Button>

      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : onClose())}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>
              {productionComponentLabels.reassignOutputLocation}
            </DialogTitle>
            <DialogDescription className="space-y-1">
              <span className="block">
                SPK <span className="font-semibold text-foreground">{orderNumber}</span>
              </span>
              <span className="block text-xs">
                {productionComponentLabels.reassignOutputLocationHelp}
              </span>
              <span className="block text-xs text-muted-foreground">
                Saat ini: <span className="font-medium text-foreground">{currentLocationName}</span>
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 py-2">
            <div className="grid gap-2">
              <Label htmlFor="output-loc">
                {productionComponentLabels.selectOutputLocation}
              </Label>
              <Select
                value={selectedLocationId}
                onValueChange={setSelectedLocationId}
              >
                <SelectTrigger
                  id="output-loc"
                  className={cn(risky && "border-destructive text-destructive")}
                >
                  <SelectValue placeholder="Pilih lokasi" />
                </SelectTrigger>
                <SelectContent>
                  {activeLocations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {risky && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span className="leading-relaxed">
                  {productionComponentLabels.outputLocationRisky}
                </span>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={isPending}>
              {productionComponentLabels.cancel}
            </Button>
            <Button
              onClick={handleSave}
              disabled={
                isPending ||
                !selectedLocationId ||
                selectedLocationId === currentLocationId
              }
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {productionComponentLabels.saveOutputLocation}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default ReassignOutputLocationButton;
