'use client';

import React from 'react';
import { ArrowLeft, Edit2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Link } from '@/i18n/navigation';

interface BOMDetailsProps {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bom: any;
    showPrices?: boolean;
}

// Helper for currency formatting
const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount);
};

export function BOMDetails({ bom, showPrices }: BOMDetailsProps) {
    const router = useRouter();

    // Calculate total cost
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const totalCost = bom.items.reduce((acc: number, item: any) => {
        const cost = Number(item.productVariant.standardCost ?? item.productVariant.buyPrice ?? 0);
        return acc + (cost * Number(item.quantity));
    }, 0);

    return (
        <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between gap-4 mb-8">
                <div className="flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => router.back()}
                        className="h-10 w-10 rounded-full border bg-background"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Recipe Details</h1>
                        <p className="text-muted-foreground text-sm">
                            Viewing configuration for {bom.name}
                        </p>
                    </div>
                </div>
                <Link href={`/dashboard/boms/${bom.id}/edit`}>
                    <Button>
                        <Edit2 className="h-4 w-4 mr-2" />
                        Edit Recipe
                    </Button>
                </Link>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
                {/* General Info */}
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <div className="flex items-center gap-3">
                            <CardTitle className="text-lg font-bold">General Information</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-1">
                                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground border-b pb-1 mb-1">Recipe Name</div>
                                <div className="text-lg font-medium">{bom.name}</div>
                            </div>
                            <div className="space-y-1">
                                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground border-b pb-1 mb-1">Output Product</div>
                                <div className="font-medium flex items-center gap-2">
                                    <span className="font-mono bg-muted px-1 rounded text-sm">{bom.productVariant.skuCode}</span>
                                    <span>{bom.productVariant.name}</span>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground border-b pb-1 mb-1">Basis Output Quantity</div>
                                <div className="text-lg font-mono font-medium">
                                    {Number(bom.outputQuantity).toLocaleString()} {bom.productVariant.primaryUnit}
                                </div>
                            </div>
                            <div className="space-y-1">
                                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground border-b pb-1 mb-1">Status</div>
                                <div>
                                    {bom.isDefault ? (
                                        <Badge variant="secondary" className="text-blue-600 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400">
                                            Default Recipe
                                        </Badge>
                                    ) : (
                                        <Badge variant="outline">
                                            Standard Recipe
                                        </Badge>
                                    )}
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Cost Summary */}
                {showPrices && (
                    <Card className="flex flex-col justify-center">
                        <CardContent className="pt-6">
                            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">Total Formula Cost</div>
                            <div className="text-4xl font-bold tracking-tight">
                                {formatCurrency(totalCost)}
                            </div>
                            <div className="mt-4">
                                <p className="text-[11px] text-muted-foreground italic">Calculated based on current standard costs.</p>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* Ingredients Table */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <div className="flex items-center gap-3">
                        <CardTitle className="text-lg font-bold">Formula Components</CardTitle>
                        <Badge variant="secondary" className="ml-2">{bom.items.length} Components</Badge>
                    </div>
                </CardHeader>

                <CardContent>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[400px]">Ingredient Material & SKU</TableHead>
                                    <TableHead className="text-center w-[200px]">Quantity</TableHead>
                                    {showPrices && <TableHead className="text-right w-[200px]">Line Cost</TableHead>}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                {bom.items.map((item: any, index: number) => {
                                    const lineCost = Number(item.productVariant.standardCost ?? item.productVariant.buyPrice ?? 0) * Number(item.quantity);

                                    return (
                                        <TableRow key={index}>
                                            <TableCell className="py-4">
                                                <div className="flex flex-col">
                                                    <span className="font-medium text-sm">{item.productVariant.name}</span>
                                                    <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1 rounded w-fit mt-1">
                                                        {item.productVariant.skuCode}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="py-4 text-center">
                                                <span className="font-mono text-base font-medium">
                                                    {Number(item.quantity).toLocaleString()}
                                                </span>
                                                <span className="text-xs text-muted-foreground ml-1">{item.productVariant.primaryUnit}</span>
                                            </TableCell>
                                            {showPrices && (
                                                <TableCell className="py-4 text-right">
                                                    <div className="flex flex-col items-end">
                                                        <span className="font-medium">
                                                            {formatCurrency(lineCost)}
                                                        </span>
                                                        <span className="text-[10px] text-muted-foreground">
                                                            @ {formatCurrency(Number(item.productVariant.standardCost ?? item.productVariant.buyPrice ?? 0))}
                                                        </span>
                                                    </div>
                                                </TableCell>
                                            )}
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
