'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { Calendar as CalendarIcon, Loader2, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { AccountingInput, formatAccounting } from '@/components/ui/accounting-input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { saveUnifiedOpeningBalance, CreateOpeningBalanceInput } from '@/actions/finance/opening-balance';
import { AccountType, AccountCategory } from '@prisma/client';

interface Account {
    id: string;
    code: string;
    name: string;
    type: AccountType;
    category: AccountCategory;
}

interface OpeningBalanceSpreadsheetProps {
    accounts: Account[];
    customers: { id: string; name: string }[];
    suppliers: { id: string; name: string }[];
}

interface GeneralLine {
    accountId: string;
    debit: number;
    credit: number;
}

// AR/AP Code Constants
const AR_ACCOUNT_CODE = '11210';
const AP_ACCOUNT_CODE = '21110';

export function OpeningBalanceSpreadsheet({ accounts, customers, suppliers }: OpeningBalanceSpreadsheetProps) {
    const [date, setDate] = React.useState<Date>(new Date());
    const [isSubmitting, setIsSubmitting] = React.useState(false);

    // General Lines State
    const [generalLines, setGeneralLines] = React.useState<Record<string, GeneralLine>>({});

    // AR/AP State
    const [arEntries, setArEntries] = React.useState<CreateOpeningBalanceInput[]>([]);
    const [apEntries, setApEntries] = React.useState<CreateOpeningBalanceInput[]>([]);

    // Dialog States
    const [isArDialogOpen, setIsArDialogOpen] = React.useState(false);
    const [isApDialogOpen, setIsApDialogOpen] = React.useState(false);

    // Temp inputs for Dialogs
    const [tempInvoice, setTempInvoice] = React.useState<Partial<CreateOpeningBalanceInput>>({
        date: new Date(),
        dueDate: new Date(),
        amount: 0
    });

    const handleGeneralChange = (accountId: string, field: 'debit' | 'credit', value: number) => {
        setGeneralLines(prev => ({
            ...prev,
            [accountId]: {
                accountId,
                debit: field === 'debit' ? value : (prev[accountId]?.debit || 0),
                credit: field === 'credit' ? value : (prev[accountId]?.credit || 0),
            }
        }));
    };

    // Calculate Totals
    const generalDebit = Object.values(generalLines).reduce((sum, l) => sum + l.debit, 0);
    const generalCredit = Object.values(generalLines).reduce((sum, l) => sum + l.credit, 0);

    const arTotal = arEntries.reduce((sum, e) => sum + e.amount, 0);
    const apTotal = apEntries.reduce((sum, e) => sum + e.amount, 0);

    const totalDebit = generalDebit + arTotal;
    const totalCredit = generalCredit + apTotal;
    const equityOffset = totalDebit - totalCredit;

    const handleSave = async () => {
        if (totalDebit === 0 && totalCredit === 0) {
            toast.error("Please enter at least one balance.");
            return;
        }

        setIsSubmitting(true);
        try {
            const formattedGeneralLines = Object.values(generalLines).filter(l => l.debit > 0 || l.credit > 0);

            const result = await saveUnifiedOpeningBalance({
                date,
                generalLines: formattedGeneralLines,
                arEntries,
                apEntries
            });

            if (result.success) {
                toast.success("Opening balances saved successfully!");
                // Optional: Redirect or Reset
                window.location.reload();
            } else {
                toast.error(result.error || "Failed to save opening balances");
            }
        } catch (error) {
            console.error(error);
            toast.error("An unexpected error occurred");
        } finally {
            setIsSubmitting(false);
        }
    };

    const addArEntry = () => {
        if (!tempInvoice.entityId || !tempInvoice.invoiceNumber || !tempInvoice.amount) {
            toast.error("Please fill all required fields");
            return;
        }
        setArEntries([...arEntries, { ...tempInvoice, type: 'AR' } as CreateOpeningBalanceInput]);
        setTempInvoice({ date: new Date(), dueDate: new Date(), amount: 0 }); // Reset
    };

    const addApEntry = () => {
        if (!tempInvoice.entityId || !tempInvoice.invoiceNumber || !tempInvoice.amount) {
            toast.error("Please fill all required fields");
            return;
        }
        setApEntries([...apEntries, { ...tempInvoice, type: 'AP' } as CreateOpeningBalanceInput]);
        setTempInvoice({ date: new Date(), dueDate: new Date(), amount: 0 }); // Reset
    };

    const removeArEntry = (index: number) => {
        setArEntries(arEntries.filter((_, i) => i !== index));
    };

    const removeApEntry = (index: number) => {
        setApEntries(apEntries.filter((_, i) => i !== index));
    };

    // Group accounts by type for display
    const groupedAccounts = React.useMemo(() => {
        const groups: Record<string, Account[]> = {
            [AccountType.ASSET]: [],
            [AccountType.LIABILITY]: [],
            [AccountType.EQUITY]: [],
            [AccountType.REVENUE]: [],
            [AccountType.EXPENSE]: [],
        };
        accounts.forEach(acc => {
            if (groups[acc.type]) groups[acc.type].push(acc);
        });
        return groups;
    }, [accounts]);

    const renderAccountRow = (account: Account) => {
        const isAR = account.code === AR_ACCOUNT_CODE;
        const isAP = account.code === AP_ACCOUNT_CODE;

        if (isAR) {
            return (
                <TableRow key={account.id} className="bg-blue-500/5 hover:bg-blue-500/10 border-l-4 border-l-blue-500/50">
                    <TableCell className="font-mono text-xs text-muted-foreground">{account.code}</TableCell>
                    <TableCell>
                        <div className="flex items-center gap-2">
                            <span className="font-medium">{account.name}</span>
                            <Badge variant="secondary" className="text-[10px] h-4 uppercase tracking-wider bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20">Control Account</Badge>
                        </div>
                    </TableCell>
                    <TableCell colSpan={2}>
                        <Button
                            variant="outline"
                            size="sm"
                            className="w-full justify-between border-blue-500/20 bg-blue-500/5 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10"
                            onClick={() => setIsArDialogOpen(true)}
                        >
                            <span className="text-xs">Manage Outstanding Invoices ({arEntries.length})</span>
                            <span className="font-mono font-bold">
                                {arTotal > 0 ? formatAccounting(arTotal) : '0'}
                            </span>
                        </Button>
                    </TableCell>
                </TableRow>
            );
        }

        if (isAP) {
            return (
                <TableRow key={account.id} className="bg-orange-500/5 hover:bg-orange-500/10 border-l-4 border-l-orange-500/50">
                    <TableCell className="font-mono text-xs text-muted-foreground">{account.code}</TableCell>
                    <TableCell>
                        <div className="flex items-center gap-2">
                            <span className="font-medium">{account.name}</span>
                            <Badge variant="secondary" className="text-[10px] h-4 uppercase tracking-wider bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20">Control Account</Badge>
                        </div>
                    </TableCell>
                    <TableCell colSpan={2}>
                        <Button
                            variant="outline"
                            size="sm"
                            className="w-full justify-between border-orange-500/20 bg-orange-500/5 text-orange-600 dark:text-orange-400 hover:bg-orange-500/10"
                            onClick={() => setIsApDialogOpen(true)}
                        >
                            <span className="text-xs">Manage Unpaid Bills ({apEntries.length})</span>
                            <span className="font-mono font-bold">
                                {apTotal > 0 ? formatAccounting(apTotal) : '0'}
                            </span>
                        </Button>
                    </TableCell>
                </TableRow>
            );
        }

        const line = generalLines[account.id] || { debit: 0, credit: 0 };
        const hasValue = line.debit > 0 || line.credit > 0;

        return (
            <TableRow key={account.id} className={hasValue ? "bg-muted/30" : ""}>
                <TableCell className="font-mono text-xs text-muted-foreground">{account.code}</TableCell>
                <TableCell>{account.name}</TableCell>
                <TableCell>
                    <AccountingInput
                        value={line.debit}
                        onValueChange={(val) => handleGeneralChange(account.id, 'debit', val)}
                        disabled={line.credit > 0} // visual helper: usually one side only
                    />
                </TableCell>
                <TableCell>
                    <AccountingInput
                        value={line.credit}
                        onValueChange={(val) => handleGeneralChange(account.id, 'credit', val)}
                        disabled={line.debit > 0}
                    />
                </TableCell>
            </TableRow>
        );
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                    <div className="space-y-1">
                        <CardTitle>Opening Balance Worksheet</CardTitle>
                        <CardDescription>Enter initial balances for all accounts via one journal.</CardDescription>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="flex flex-col items-end">
                            <Label className="text-xs text-muted-foreground mb-1">Opening Date</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant={"outline"}
                                        className={cn(
                                            "w-[200px] justify-start text-left font-normal",
                                            !date && "text-muted-foreground"
                                        )}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {date ? format(date, "PPP") : <span>Pick a date</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                    <Calendar
                                        mode="single"
                                        selected={date}
                                        onSelect={(d) => d && setDate(d)}
                                        initialFocus
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border h-[600px] overflow-auto relative">
                        <Table>
                            <TableHeader className="sticky top-0 bg-background z-10">
                                <TableRow>
                                    <TableHead className="w-[100px]">Code</TableHead>
                                    <TableHead>Account Name</TableHead>
                                    <TableHead className="w-[200px] text-right">Debit</TableHead>
                                    <TableHead className="w-[200px] text-right">Credit</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {Object.keys(groupedAccounts).map((type) => (
                                    <React.Fragment key={type}>
                                        <TableRow className="bg-muted/50 hover:bg-muted/50">
                                            <TableCell colSpan={4} className="font-semibold text-xs uppercase tracking-wider py-2">
                                                {type}
                                            </TableCell>
                                        </TableRow>
                                        {groupedAccounts[type].map(renderAccountRow)}
                                    </React.Fragment>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            {/* Sticky Footer for Totals */}
            {/* Sticky Footer for Totals */}
            <div className="sticky bottom-4 z-20">
                <Card className="shadow-lg border-2 border-primary/20">
                    <CardContent className="p-3">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
                            <div className="space-y-0.5">
                                <Label className="text-[10px] text-muted-foreground block uppercase tracking-wider">Total Debit</Label>
                                <div className="text-lg font-mono font-bold">{formatAccounting(totalDebit)}</div>
                            </div>
                            <div className="space-y-0.5">
                                <Label className="text-[10px] text-muted-foreground block uppercase tracking-wider">Total Credit</Label>
                                <div className="text-lg font-mono font-bold">{formatAccounting(totalCredit)}</div>
                            </div>
                            <div className="space-y-0.5">
                                <Label className="text-[10px] text-muted-foreground block uppercase tracking-wider">Equity Offset</Label>
                                <div className={cn("text-lg font-mono font-bold", equityOffset === 0 ? "text-muted-foreground" : equityOffset > 0 ? "text-orange-600" : "text-emerald-600")}>
                                    {formatAccounting(Math.abs(equityOffset))} {equityOffset > 0 ? 'Cr' : equityOffset < 0 ? 'Dr' : ''}
                                </div>
                            </div>
                            <div className="flex justify-end">
                                <Button
                                    size="default"
                                    className="w-full md:w-auto font-semibold"
                                    onClick={handleSave}
                                    disabled={isSubmitting || (totalDebit === 0 && totalCredit === 0)}
                                >
                                    {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                    Save Balances
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* AR Dialog */}
            <Dialog open={isArDialogOpen} onOpenChange={setIsArDialogOpen}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>Manage Outstanding Invoices (Piutang)</DialogTitle>
                        <DialogDescription>Add valid unpaid invoices from customers.</DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-12 gap-2 items-end border-b pb-4">
                            <div className="col-span-3">
                                <Label>Customer</Label>
                                <select
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                                    value={tempInvoice.entityId || ''}
                                    onChange={(e) => setTempInvoice({ ...tempInvoice, entityId: e.target.value })}
                                >
                                    <option value="">Select Customer</option>
                                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>
                            <div className="col-span-3">
                                <Label>Invoice No.</Label>
                                <Input
                                    value={tempInvoice.invoiceNumber || ''}
                                    onChange={(e) => setTempInvoice({ ...tempInvoice, invoiceNumber: e.target.value })}
                                    placeholder="INV-001"
                                />
                            </div>
                            <div className="col-span-3">
                                <Label>Amount</Label>
                                <AccountingInput
                                    value={tempInvoice.amount || 0}
                                    onValueChange={(val) => setTempInvoice({ ...tempInvoice, amount: val })}
                                />
                            </div>
                            <div className="col-span-3">
                                <Button onClick={addArEntry} className="w-full"><Plus className="mr-2 h-4 w-4" /> Add</Button>
                            </div>
                        </div>

                        <div className="max-h-[300px] overflow-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Customer</TableHead>
                                        <TableHead>Invoice #</TableHead>
                                        <TableHead className="text-right">Amount</TableHead>
                                        <TableHead className="w-[50px]"></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {arEntries.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={4} className="text-center text-muted-foreground h-24">No invoices added yet.</TableCell>
                                        </TableRow>
                                    )}
                                    {arEntries.map((entry, idx) => (
                                        <TableRow key={idx}>
                                            <TableCell>{customers.find(c => c.id === entry.entityId)?.name}</TableCell>
                                            <TableCell>{entry.invoiceNumber}</TableCell>
                                            <TableCell className="text-right font-mono">{formatAccounting(entry.amount)}</TableCell>
                                            <TableCell>
                                                <Button variant="ghost" size="icon" onClick={() => removeArEntry(idx)} className="h-8 w-8 text-destructive"><Trash2 className="h-4 w-4" /></Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                    <DialogFooter>
                        <div className="mr-auto text-sm text-muted-foreground flex items-center">
                            Total Receivables: <span className="ml-2 font-mono font-bold text-foreground">{formatAccounting(arTotal)}</span>
                        </div>
                        <Button onClick={() => setIsArDialogOpen(false)}>Done</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* AP Dialog */}
            <Dialog open={isApDialogOpen} onOpenChange={setIsApDialogOpen}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>Manage Unpaid Bills (Hutang)</DialogTitle>
                        <DialogDescription>Add valid unpaid bills from suppliers.</DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-12 gap-2 items-end border-b pb-4">
                            <div className="col-span-3">
                                <Label>Supplier</Label>
                                <select
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                                    value={tempInvoice.entityId || ''}
                                    onChange={(e) => setTempInvoice({ ...tempInvoice, entityId: e.target.value })}
                                >
                                    <option value="">Select Supplier</option>
                                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </div>
                            <div className="col-span-3">
                                <Label>Bill Number</Label>
                                <Input
                                    value={tempInvoice.invoiceNumber || ''}
                                    onChange={(e) => setTempInvoice({ ...tempInvoice, invoiceNumber: e.target.value })}
                                    placeholder="BILL-001"
                                />
                            </div>
                            <div className="col-span-3">
                                <Label>Amount</Label>
                                <AccountingInput
                                    value={tempInvoice.amount || 0}
                                    onValueChange={(val) => setTempInvoice({ ...tempInvoice, amount: val })}
                                />
                            </div>
                            <div className="col-span-3">
                                <Button onClick={addApEntry} className="w-full"><Plus className="mr-2 h-4 w-4" /> Add</Button>
                            </div>
                        </div>

                        <div className="max-h-[300px] overflow-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Supplier</TableHead>
                                        <TableHead>Bill #</TableHead>
                                        <TableHead className="text-right">Amount</TableHead>
                                        <TableHead className="w-[50px]"></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {apEntries.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={4} className="text-center text-muted-foreground h-24">No bills added yet.</TableCell>
                                        </TableRow>
                                    )}
                                    {apEntries.map((entry, idx) => (
                                        <TableRow key={idx}>
                                            <TableCell>{suppliers.find(s => s.id === entry.entityId)?.name}</TableCell>
                                            <TableCell>{entry.invoiceNumber}</TableCell>
                                            <TableCell className="text-right font-mono">{formatAccounting(entry.amount)}</TableCell>
                                            <TableCell>
                                                <Button variant="ghost" size="icon" onClick={() => removeApEntry(idx)} className="h-8 w-8 text-destructive"><Trash2 className="h-4 w-4" /></Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                    <DialogFooter>
                        <div className="mr-auto text-sm text-muted-foreground flex items-center">
                            Total Payables: <span className="ml-2 font-mono font-bold text-foreground">{formatAccounting(apTotal)}</span>
                        </div>
                        <Button onClick={() => setIsApDialogOpen(false)}>Done</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
