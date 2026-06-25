"use client";

import { useState, useMemo, useCallback } from "react";
import { FixedAsset, Account } from "@prisma/client";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { deleteAsset, runDepreciation } from "@/actions/finance/asset-actions";
import { toast } from "sonner";
import { AssetForm } from "./AssetForm";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Trash2,
  Play,
  Loader2,
  Package,
  DollarSign,
  TrendingDown,
  CheckCircle,
} from "lucide-react";
import { formatRupiah, cn } from "@/lib/utils/utils";
import { DataTableSortIcon } from "@/components/ui/data-table-sort-icon";
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

type AssetWithAccounts = FixedAsset & {
  assetAccount: Account;
  accumDepreciationAccount: Account;
  depreciationExpenseAccount: Account;
};

interface AssetListClientProps {
  initialAssets: AssetWithAccounts[];
  accounts: Account[];
}

export function AssetListClient({
  initialAssets,
  accounts,
}: AssetListClientProps) {
  const [data, setData] = useState(initialAssets);
  const [search, setSearch] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [runningDepr, setRunningDepr] = useState(false);

  const filteredData = useMemo(() => {
    return data.filter(
      (item) =>
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        item.assetCode.toLowerCase().includes(search.toLowerCase()),
    );
  }, [data, search]);

  // Summary calculations
  const summary = useMemo(() => {
    const totalAssets = data.length;
    const totalPurchaseValue = data.reduce(
      (sum, a) => sum + Number(a.purchaseValue),
      0,
    );

    // Approximate book value: purchaseValue - (monthlyDepreciation * monthsElapsed)
    const totalBookValue = data.reduce((sum, a) => {
      const value = Number(a.purchaseValue);
      const scrap = Number(a.scrapValue);
      const life = a.usefulLifeMonths;
      if (life <= 0) return sum + value;
      const monthlyDepr = (value - scrap) / life;
      const purchaseDate = new Date(a.purchaseDate);
      const now = new Date();
      const monthsElapsed = Math.max(
        0,
        (now.getFullYear() - purchaseDate.getFullYear()) * 12 +
          (now.getMonth() - purchaseDate.getMonth()),
      );
      const accumulated = Math.min(monthlyDepr * monthsElapsed, value - scrap);
      return sum + (value - accumulated);
    }, 0);

    const depreciatedCount = data.filter((a) => a.lastDepreciationDate).length;

    return {
      totalAssets,
      totalPurchaseValue,
      totalBookValue,
      depreciatedCount,
    };
  }, [data]);

  const handleDelete = async (id: string) => {
    try {
      await deleteAsset(id);
      setData((prev) => prev.filter((a) => a.id !== id));
      toast.success("Aset berhasil dihapus.");
    } catch (error) {
      console.error("Delete failed", error);
      toast.error("Gagal menghapus aset");
    }
  };

  const handleRunDepreciation = useCallback(async () => {
    setRunningDepr(true);
    try {
      const result = await runDepreciation();
      if (result && "success" in result && result.success) {
        const res = result.data as { count: number; message: string };
        toast.success(res.message);
        // Refresh data
        setData((prev) =>
          prev.map((a) => ({
            ...a,
            lastDepreciationDate: new Date(),
          })),
        );
      } else {
        toast.error(
          result && "error" in result
            ? (result.error as string)
            : "Gagal menjalankan depresiasi",
        );
      }
    } catch {
      toast.error("Terjadi kesalahan");
    } finally {
      setRunningDepr(false);
    }
  }, []);

  const columns: ColumnDef<AssetWithAccounts>[] = [
    {
      accessorKey: "assetCode",
      header: "Code",
    },
    {
      accessorKey: "name",
      header: "Name",
    },
    {
      accessorKey: "purchaseDate",
      header: "Purchase Date",
      cell: ({ row }) => format(new Date(row.getValue("purchaseDate")), "PP"),
    },
    {
      accessorKey: "purchaseValue",
      header: "Value",
      cell: ({ row }) => formatRupiah(Number(row.getValue("purchaseValue"))),
    },
    {
      accessorKey: "usefulLifeMonths",
      header: "Life (Mo)",
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant="outline">{row.getValue("status")}</Badge>
      ),
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const asset = row.original;
        return (
          <div className="flex gap-2 justify-end">
            <AssetForm existingAsset={asset} accounts={accounts} />
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Apakah Anda yakin?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Tindakan ini tidak dapat dibatalkan. Ini akan menghapus
                    permanen aset.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Batal</AlertDialogCancel>
                  <AlertDialogAction onClick={() => handleDelete(asset.id)}>
                    Hapus
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        );
      },
    },
  ];

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Aset Tetap</h1>
          <p className="text-muted-foreground">
            Kelola aset tetap dan depresiasi
          </p>
        </div>
        <div className="flex items-center gap-2">
          <AssetForm accounts={accounts} />
          <Button
            onClick={handleRunDepreciation}
            disabled={runningDepr}
            className="gap-2"
          >
            {runningDepr ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {runningDepr ? "Memproses..." : "Jalankan Depresiasi"}
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Aset</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.totalAssets}</div>
            <p className="text-xs text-muted-foreground">aset tercatat</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Nilai Perolehan
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatRupiah(summary.totalPurchaseValue)}
            </div>
            <p className="text-xs text-muted-foreground">total pembelian</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Nilai Buku</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatRupiah(summary.totalBookValue)}
            </div>
            <p className="text-xs text-muted-foreground">setelah depresiasi</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Terdepresiasi</CardTitle>
            <CheckCircle className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.depreciatedCount}</div>
            <p className="text-xs text-muted-foreground">
              dari {summary.totalAssets} aset
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Asset Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Daftar Aset</CardTitle>
              <CardDescription>Seluruh aset tetap perusahaan</CardDescription>
            </div>
            <Input
              placeholder="Cari aset..."
              className="w-[250px]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => {
                      return (
                        <TableHead
                          key={header.id}
                          className={cn(
                            header.column.getCanSort() &&
                              "cursor-pointer select-none hover:bg-muted/50",
                          )}
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {header.isPlaceholder ? null : (
                            <div className="flex items-center gap-2">
                              {flexRender(
                                header.column.columnDef.header,
                                header.getContext(),
                              )}
                              {header.column.getCanSort() && (
                                <DataTableSortIcon
                                  direction={header.column.getIsSorted()}
                                />
                              )}
                            </div>
                          )}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows?.length ? (
                  table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      data-state={row.getIsSelected() && "selected"}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length}
                      className="h-24 text-center"
                    >
                      {data.length === 0
                        ? "Belum ada aset tetap."
                        : "Tidak ada aset yang cocok."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
