'use client';

import { useState } from 'react';
import { Account } from '@prisma/client';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { upsertBudget } from '@/actions/finance/budget-actions';
import { toast } from 'sonner';

interface BudgetListClientProps {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    initialBudgets: any[];
    accounts: Account[];
    year: number;
}

export function BudgetListClient({ initialBudgets, accounts, year: initialYear }: BudgetListClientProps) {
    const [year, setYear] = useState(initialYear.toString());
    const [budgets, setBudgets] = useState(initialBudgets);
    // Actually, for year change we should probably navigate or re-fetch.
    // For now, let's keep it simple: Changing year will reload page by navigation?
    // Or simpler: Just a selector that pushes router.

    // But `initialBudgets` comes from server. 
    // Let's implement client-side year switching via navigation

    // For editing:
    const [editingCell, setEditingCell] = useState<{ accountId: string, month: number } | null>(null);
    const [editValue, setEditValue] = useState('');

    const handleCellClick = (accountId: string, month: number, currentValue: number) => {
        setEditingCell({ accountId, month });
        setEditValue(currentValue.toString());
    };

    const handleSave = async () => {
        if (!editingCell) return;
        try {
            await upsertBudget({
                accountId: editingCell.accountId,
                year: parseInt(year),
                month: editingCell.month,
                amount: parseFloat(editValue) || 0
            });

            // Optimistic update or refetch?
            // Simple: Update local state
            const newBudgets = [...budgets];
            const existingIndex = newBudgets.findIndex(b =>
                b.accountId === editingCell.accountId &&
                b.year === parseInt(year) &&
                b.month === editingCell.month
            );

            if (existingIndex >= 0) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                newBudgets[existingIndex] = { ...newBudgets[existingIndex], amount: (parseFloat(editValue) as any) };
            } else {
                newBudgets.push({
                    id: 'temp-' + Date.now(),
                    accountId: editingCell.accountId,
                    year: parseInt(year),
                    month: editingCell.month,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    amount: (parseFloat(editValue) as any),
                    createdAt: new Date(),
                    updatedAt: new Date()
                });
            }
            setBudgets(newBudgets);
            toast.success("Budget saved");
            setEditingCell(null);
        } catch (error) {
            toast.error("Failed to save");
            console.error(error);
        }
    };

    const getBudgetAmount = (accountId: string, month: number) => {
        const b = budgets.find(b => b.accountId === accountId && b.month === month && b.year === parseInt(year));
        return b ? Number(b.amount) : 0;
    };

    const getTotalBudget = (accountId: string) => {
        return budgets
            .filter(b => b.accountId === accountId && b.year === parseInt(year))
            .reduce((sum, b) => sum + Number(b.amount), 0);
    };

    // Group accounts by category/type for better display? 
    // Or just flat list. Flat list for now.

    const months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Budgeting</h2>
                    <p className="text-muted-foreground">Plan and track monthly budgets per account.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Select value={year} onValueChange={(val) => {
                        setYear(val);
                        window.location.href = `/finance/budget?year=${val}`;
                    }}>
                        <SelectTrigger className="w-[120px]">
                            <SelectValue placeholder="Year" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="2024">2024</SelectItem>
                            <SelectItem value="2025">2025</SelectItem>
                            <SelectItem value="2026">2026</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">Budget Matrix ({year})</CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                    <div className="rounded-md border min-w-[1200px]">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[200px] sticky left-0 bg-background z-10">Account</TableHead>
                                    <TableHead className="text-right font-bold">Total</TableHead>
                                    {monthNames.map((m) => (
                                        <TableHead key={m} className="text-right min-w-[100px]">{m}</TableHead>
                                    ))}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {accounts.map((acc) => {
                                    const total = getTotalBudget(acc.id);
                                    return (
                                        <TableRow key={acc.id}>
                                            <TableCell className="font-medium sticky left-0 bg-background z-10 border-r">
                                                <div className="flex flex-col">
                                                    <span>{acc.name}</span>
                                                    <span className="text-xs text-muted-foreground">{acc.code}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right font-bold bg-muted/20">
                                                {total.toLocaleString('id-ID')}
                                            </TableCell>
                                            {months.map((m) => {
                                                const amount = getBudgetAmount(acc.id, m);
                                                const isEditing = editingCell?.accountId === acc.id && editingCell?.month === m;

                                                return (
                                                    <TableCell
                                                        key={m}
                                                        className="text-right cursor-pointer hover:bg-muted/50 p-2"
                                                        onClick={() => !isEditing && handleCellClick(acc.id, m, amount)}
                                                    >
                                                        {isEditing ? (
                                                            <div className="flex items-center gap-1">
                                                                <Input
                                                                    className="h-8 w-24 text-right px-1"
                                                                    autoFocus
                                                                    type="number"
                                                                    value={editValue}
                                                                    onChange={(e) => setEditValue(e.target.value)}
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === 'Enter') handleSave();
                                                                        if (e.key === 'Escape') setEditingCell(null);
                                                                    }}
                                                                    onBlur={handleSave}
                                                                />
                                                            </div>
                                                        ) : (
                                                            amount > 0 ? amount.toLocaleString('id-ID') : '-'
                                                        )}
                                                    </TableCell>
                                                );
                                            })}
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
