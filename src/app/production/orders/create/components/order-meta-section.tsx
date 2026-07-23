"use client";

import { FormField, FormItem, FormControl, FormLabel, FormMessage } from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Link } from "lucide-react";
import { UseFormReturn, FieldValues } from "react-hook-form";

interface OrderMetaSectionProps {
  form: UseFormReturn<FieldValues>;
  salesOrderId?: string;
  salesOrderContext?: {
    orderNumber: string;
    productName?: string;
    remainingQty?: number;
  } | null;
}

export function OrderMetaSection({
  form,
  salesOrderId,
  salesOrderContext,
}: OrderMetaSectionProps) {
  return (
    <div className="space-y-4">
      {/* SO Context Banner — shows whenever salesOrderId is present */}
      {salesOrderId && (
        <Alert className="py-2 border-blue-200 bg-blue-50/50 dark:border-blue-800/50 dark:bg-blue-900/20">
          <Link className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-xs">
            <span className="font-medium">Dari Sales Order / Papan FG</span>
            <br />
            SO {salesOrderContext?.orderNumber || salesOrderId}
            {salesOrderContext?.productName && ` · Produk ${salesOrderContext.productName}`}
            {salesOrderContext?.remainingQty != null && ` · Sisa ${salesOrderContext.remainingQty}`}
            <br />
            <span className="text-muted-foreground">
              Prefill resep & target bila tersedia. Boleh ubah sebelum buat.
            </span>
          </AlertDescription>
        </Alert>
      )}

      {/* Priority */}
      <FormField
        control={form.control}
        name="priority"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Prioritas</FormLabel>
            <Select
              onValueChange={field.onChange}
              defaultValue={(field.value as string) || "NORMAL"}
            >
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih prioritas" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="URGENT">🔴 URGENT</SelectItem>
                <SelectItem value="NORMAL">🟡 NORMAL</SelectItem>
                <SelectItem value="LOW">🟢 LOW</SelectItem>
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Notes */}
      <FormField
        control={form.control}
        name="notes"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Catatan</FormLabel>
            <FormControl>
              <Textarea
                placeholder="Tambahkan instruksi khusus..."
                className="resize-none"
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
