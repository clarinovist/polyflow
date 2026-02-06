'use client';

import React from 'react';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { formatRupiah } from '@/lib/utils';

export interface HistoryItem {
    id: string;
    type: 'AR' | 'AP';
    invoiceNumber: string;
    entityName: string;
    date: string | Date;
    amount: number;
    createdAt: string | Date;
}

interface OpeningBalanceHistoryProps {
    data: HistoryItem[];
}

export function OpeningBalanceHistory({ data }: OpeningBalanceHistoryProps) {
    if (data.length === 0) return null;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-2xl mx-auto mt-8"
        >
            <Card className="border-secondary/20 shadow-lg bg-card/50 backdrop-blur-sm">
                <CardHeader className="pb-4">
                    <CardTitle className="text-xl font-bold tracking-tight">Recent Opening Balances</CardTitle>
                    <CardDescription className="text-xs">
                        The most recent outstanding invoices recorded in the system.
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="border-t border-secondary/10">
                        <Table>
                            <TableHeader className="bg-muted/30">
                                <TableRow className="hover:bg-transparent border-secondary/10">
                                    <TableHead className="h-10 text-[10px] uppercase tracking-wider font-semibold">Date</TableHead>
                                    <TableHead className="h-10 text-[10px] uppercase tracking-wider font-semibold text-center">Type</TableHead>
                                    <TableHead className="h-10 text-[10px] uppercase tracking-wider font-semibold">Entity & Inv #</TableHead>
                                    <TableHead className="h-10 text-right text-[10px] uppercase tracking-wider font-semibold">Amount</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {data.map((item, index) => (
                                    <motion.tr
                                        key={item.id}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: index * 0.05 }}
                                        className="group hover:bg-muted/50 transition-colors border-secondary/10"
                                    >
                                        <TableCell className="py-3 text-[13px] font-medium text-muted-foreground whitespace-nowrap">
                                            {format(new Date(item.date), 'dd MMM yy')}
                                        </TableCell>
                                        <TableCell className="py-3 text-center">
                                            <Badge
                                                className={`
                                                    text-[9px] px-1.5 py-0 uppercase tracking-tighter border-none
                                                    ${item.type === 'AR'
                                                        ? 'bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/20'
                                                        : 'bg-rose-500/15 text-rose-500 hover:bg-rose-500/20'}
                                                `}
                                            >
                                                {item.type}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="py-3">
                                            <div className="flex flex-col">
                                                <span className="text-[13px] font-semibold leading-none mb-1 group-hover:text-primary transition-colors">
                                                    {item.entityName}
                                                </span>
                                                <span className="text-[10px] font-mono text-muted-foreground leading-none">
                                                    {item.invoiceNumber}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-3 text-right">
                                            <span className="text-[14px] font-bold font-mono text-primary">
                                                {formatRupiah(item.amount)}
                                            </span>
                                        </TableCell>
                                    </motion.tr>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </motion.div>
    );
}
