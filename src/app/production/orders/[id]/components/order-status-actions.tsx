"use client";

import { Button } from "@/components/ui/button";
import {
  updateProductionOrder,
  deleteProductionOrder,
} from "@/actions/production/production";
import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ExtendedProductionOrder } from "@/components/production/order-detail/types";
import { AddOutputDialog } from "@/components/production/order-detail/AddOutputDialog";
import {
  Location,
  Machine,
  Employee,
  WorkShift,
  ProductVariant,
} from "@prisma/client";

interface Props {
  order: ExtendedProductionOrder;
  formData?: {
    locations: Location[];
    operators: Employee[];
    helpers: Employee[];
    workShifts: WorkShift[];
    machines: Machine[];
    rawMaterials: ProductVariant[];
  };
}

export function OrderStatusActions({ order, formData }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  const handleDelete = async () => {
    setLoading("delete");
    try {
      await toast.promise(deleteProductionOrder(order.id), {
        loading: "Menghapus SPK…",
        success: (result) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const r = result as any;
          if (r?.success === false) throw new Error(r.error);
          router.push("/production/orders");
          return "SPK berhasil dihapus";
        },
        error: (err) => `Gagal menghapus: ${err.message}`,
      });
    } finally {
      setLoading(null);
    }
  };

  const transition = async (nextStatus: string, toastMsg: string) => {
    setLoading(nextStatus);
    try {
      const res = await updateProductionOrder({
        id: order.id,
        status: nextStatus as never,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const typed = res as any;
      if (typed?.success === false) throw new Error(typed.error);
      toast.success(toastMsg);
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Gagal";
      toast.error(msg);
    } finally {
      setLoading(null);
    }
  };

  const canCancel =
    (order.status === "RELEASED" || order.status === "IN_PROGRESS") &&
    order.materialIssues.length === 0 &&
    order.executions.length === 0 &&
    Number(order.actualQuantity || 0) === 0;

  const cancelDialog = canCancel ? (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          disabled={!!loading}
          className="text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800/50 dark:hover:bg-red-900/20"
        >
          Batalkan SPK
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Batalkan SPK?</AlertDialogTitle>
          <AlertDialogDescription>
            Ini akan mengubah status SPK menjadi Dibatalkan. Karena belum ada
            material yang dikeluarkan dan belum ada output yang dicatat, ini aman
            untuk menutup SPK duplikat atau yang tidak diperlukan.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Kembali</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => transition("CANCELLED", `SPK ${order.orderNumber} dibatalkan`)}
            className="bg-red-600 hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600"
          >
            Konfirmasi Pembatalan
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ) : null;

  if (order.status === "DRAFT" || order.status === "WAITING_MATERIAL") {
    return (
      <div className="flex items-center gap-2">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="icon" title="Hapus SPK" disabled={!!loading}>
              {loading === "delete" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Apakah Anda yakin?</AlertDialogTitle>
              <AlertDialogDescription>
                Tindakan ini tidak dapat dibatalkan. Ini akan menghapus permanen
                SPK beserta kebutuhan materialnya.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Batal</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive hover:bg-destructive/90"
              >
                Hapus
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <Button
          onClick={() => transition("RELEASED", `SPK ${order.orderNumber} dirilis`)}
          disabled={!!loading}
          aria-busy={!!loading}
        >
          {loading === "RELEASED" && (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          )}
          Rilis SPK
        </Button>
      </div>
    );
  }

  if (order.status === "RELEASED") {
    return (
      <div className="flex items-center gap-2">
        {cancelDialog}
        <Button
          onClick={() => transition("IN_PROGRESS", `SPK ${order.orderNumber} dimulai`)}
          disabled={!!loading}
          aria-busy={!!loading}
        >
          {loading === "IN_PROGRESS" && (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          )}
          Mulai Produksi
        </Button>
      </div>
    );
  }

  if (order.status === "IN_PROGRESS") {
    return (
      <div className="flex items-center gap-2">
        {cancelDialog}
        {formData && (
          <AddOutputDialog order={order} formData={formData as never} />
        )}
        <Button
          variant="outline"
          onClick={() => transition("COMPLETED", `SPK ${order.orderNumber} diselesaikan`)}
          disabled={!!loading}
          aria-busy={!!loading}
        >
          {loading === "COMPLETED" && (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          )}
          Selesai SPK
        </Button>
      </div>
    );
  }

  if (order.status === "COMPLETED") {
    return (
      <Button variant="outline" disabled>
        Selesai
      </Button>
    );
  }

  if (order.status === "CANCELLED") {
    return (
      <Button
        variant="outline"
        disabled
        className="text-red-500 bg-red-50 dark:text-red-400 dark:bg-red-900/20"
      >
        SPK Dibatalkan
      </Button>
    );
  }

  return null;
}
