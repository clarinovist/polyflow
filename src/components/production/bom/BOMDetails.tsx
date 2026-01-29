'use client';

import React from 'react';
import { ArrowLeft, Edit2, Package, Layers } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { BrandCard, BrandCardContent, BrandCardHeader, BrandGradientText } from '@/components/brand/BrandCard';
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
                        className="h-10 w-10 rounded-full border border-white/10 bg-background/50"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <h1 className="text-3xl font-black tracking-tight">
                            <BrandGradientText>Recipe Details</BrandGradientText>
                        </h1>
                        <p className="text-muted-foreground text-sm font-medium">
                            Viewing configuration for {bom.name}
                        </p>
                    </div>
                </div>
                <Link href={`/dashboard/boms/${bom.id}/edit`}>
                    <Button className="bg-brand hover:bg-brand-hover shadow-lg shadow-brand/20">
                        <Edit2 className="h-4 w-4 mr-2" />
                        Edit Recipe
                    </Button>
                </Link>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
                {/* General Info */}
                <BrandCard className="lg:col-span-2">
                    <BrandCardHeader>
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center">
                                <Package className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                                <h3 className="text-lg font-black uppercase tracking-widest text-foreground">General Information</h3>
                            </div>
                        </div>
                    </BrandCardHeader>
                    <BrandCardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-1">
                                <div className="text-[10px] font-bold uppercase tracking-wider opacity-60">Recipe Name</div>
                                <div className="text-lg font-bold">{bom.name}</div>
                            </div>
                            <div className="space-y-1">
                                <div className="text-[10px] font-bold uppercase tracking-wider opacity-60">Output Product</div>
                                <div className="font-bold flex items-center gap-2">
                                    <span className="font-mono bg-muted/50 px-1 rounded text-sm">{bom.productVariant.skuCode}</span>
                                    <span>{bom.productVariant.name}</span>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <div className="text-[10px] font-bold uppercase tracking-wider opacity-60">Basis Output Quantity</div>
                                <div className="text-lg font-mono font-bold">
                                    {Number(bom.outputQuantity).toLocaleString()} {bom.productVariant.primaryUnit}
                                </div>
                            </div>
                            <div className="space-y-1">
                                <div className="text-[10px] font-bold uppercase tracking-wider opacity-60">Status</div>
                                <div>
                                    {bom.isDefault ? (
                                        <Badge variant="secondary" className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/10">
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
                    </BrandCardContent>
                </BrandCard>

                {/* Cost Summary */}
                {showPrices && (
                    <div className="bg-emerald-600/10 backdrop-blur-brand border border-emerald-500/20 rounded-3xl p-8 flex flex-col justify-center relative overflow-hidden group shadow-brand">
                        <div className="text-xs font-black uppercase tracking-[0.3em] text-emerald-600/70 dark:text-emerald-400/70 mb-2">Total Formula Cost</div>
                        <div className="text-5xl font-black text-emerald-600 dark:text-emerald-400 tracking-tighter">
                            {formatCurrency(totalCost)}
                        </div>
                        <div className="mt-6">
                            <p className="text-[11px] text-muted-foreground font-bold italic">Calculated based on current standard costs.</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Ingredients Table */}
            <BrandCard className="overflow-hidden rounded-3xl">
                <BrandCardHeader>
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center">
                            <Layers className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <h3 className="text-lg font-black uppercase tracking-widest text-foreground">Formula Components</h3>
                            <p className="text-xs text-muted-foreground font-medium">Bill of Materials breakdown</p>
                        </div>
                        <Badge variant="secondary" className="ml-2 h-6 px-3 font-black text-xs bg-primary/10 text-primary border-primary/20">{bom.items.length} Components</Badge>
                    </div>
                </BrandCardHeader>

                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader className="bg-muted/30 border-b border-brand">
                            <TableRow className="hover:bg-transparent border-0">
                                <TableHead className="text-[11px] font-black uppercase tracking-widest text-muted-foreground px-8 py-5">Ingredient Material & SKU</TableHead>
                                <TableHead className="text-[11px] font-black uppercase tracking-widest text-muted-foreground py-5 text-center w-[200px]">Quantity</TableHead>
                                {showPrices && <TableHead className="text-[11px] font-black uppercase tracking-widest text-muted-foreground py-5 text-right w-[200px]">Line Cost</TableHead>}
                            </TableRow>
                        </TableHeader>
                        <TableBody className="[&_tr:last-child]:border-0 px-8">
                            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                            {bom.items.map((item: any, index: number) => {
                                const lineCost = Number(item.productVariant.standardCost ?? item.productVariant.buyPrice ?? 0) * Number(item.quantity);
                                
                                return (
                                    <TableRow key={index} className="border-white/5 hover:bg-primary/[0.02] transition-colors">
                                        <TableCell className="py-6 px-8">
                                            <div className="flex flex-col">
                                                <span className="font-bold text-sm tracking-tight">{item.productVariant.name}</span>
                                                <span className="text-[10px] font-mono text-muted-foreground bg-muted/50 px-1 rounded w-fit mt-1">
                                                    {item.productVariant.skuCode}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-6 text-center">
                                            <span className="font-mono text-lg font-medium">
                                                {Number(item.quantity).toLocaleString()}
                                            </span>
                                            <span className="text-xs text-muted-foreground ml-1">{item.productVariant.primaryUnit}</span>
                                        </TableCell>
                                        {showPrices && (
                                            <TableCell className="py-6 text-right">
                                                <div className="flex flex-col items-end">
                                                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                                        {formatCurrency(lineCost)}
                                                    </span>
                                                    <span className="text-[10px] text-muted-foreground opacity-60">
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
            </BrandCard>
        </div>
    );
}
