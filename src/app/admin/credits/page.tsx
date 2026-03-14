'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Wallet, Search, PlusCircle, MinusCircle, User } from 'lucide-react';
import { toast } from 'sonner';

// Given this is an administrative UI, the actual data fetching and mutation would
// integrate with tRPC/Server Actions dealing with Prisma "User.credits".
// This scaffolding defines the visual representation.

export default function CreditsManagementPage() {
    const [emailSearch, setEmailSearch] = useState('');
    const [selectedUser, setSelectedUser] = useState<{
        id: string;
        name: string;
        email: string;
        currentBalance: number;
        lastTopup: string;
    } | null>(null);
    const [amount, setAmount] = useState<number | ''>('');

    // Mock search function
    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        
        // Simulating an API Search Activity
        if (emailSearch.includes('@')) {
            setSelectedUser({
                id: 'usr_xyz123',
                name: 'John Doe',
                email: emailSearch,
                currentBalance: 12500,
                lastTopup: new Date().toISOString()
            });
            toast.success(`Successfully located records for ${emailSearch}`);
        } else {
            toast.error('Please enter a valid email address.');
        }
    };

    const handleAdjust = (type: 'add' | 'deduct') => {
        if (!selectedUser || !amount || amount <= 0) return;

        // Optimistic UI updates (will align with action `adjustCredits(userId, amount, type)`)
        const adjustment = type === 'add' ? Number(amount) : -Number(amount);
        
        if (type === 'deduct' && selectedUser.currentBalance < Number(amount)) {
            return toast.error('Deduction amount exceeds current user balance.');
        }

        setSelectedUser({
            ...selectedUser,
            currentBalance: selectedUser.currentBalance + adjustment
        });
        
        toast.success(`Successfully ${type === 'add' ? 'added' : 'deducted'} ${amount} API credits.`);
        
        setAmount('');
    };

    return (
        <div className="flex-1 space-y-4 p-8 pt-6">
            <div className="flex items-center justify-between space-y-2 mb-6">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Credit Operations</h2>
                    <p className="text-sm text-muted-foreground">Manage organizational and personal API usage credits.</p>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Card className="col-span-full md:col-span-1">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Search className="w-5 h-5" /> Locate Target
                        </CardTitle>
                        <CardDescription>Search for an tenant account by their active email assignment.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSearch} className="flex flex-col space-y-4">
                            <Input
                                type="email"
                                placeholder="E.g., finance@tenant.com"
                                value={emailSearch}
                                onChange={(e) => setEmailSearch(e.target.value)}
                                required
                            />
                            <Button type="submit" className="w-full">Lookup Credentials</Button>
                        </form>
                    </CardContent>
                </Card>

                {selectedUser ? (
                    <Card className="col-span-full md:col-span-2 shadow-sm border-blue-100">
                        <CardHeader className="bg-slate-50/50 rounded-t-xl border-b border-slate-100">
                            <div className="flex justify-between items-start">
                                <div>
                                    <CardTitle className="text-xl flex items-center gap-2">
                                        <User className="w-5 h-5 text-slate-500" />
                                        {selectedUser.name}
                                    </CardTitle>
                                    <CardDescription className="mt-1 font-mono text-xs">{selectedUser.email}</CardDescription>
                                </div>
                                <div className="text-right">
                                    <div className="text-sm font-medium text-slate-500 mb-1">Current Wallet Balance</div>
                                    <div className="text-3xl font-bold font-mono tracking-tight text-emerald-600 flex items-center gap-2 justify-end">
                                        <Wallet className="w-6 h-6 opacity-50" />
                                        {selectedUser.currentBalance.toLocaleString()}
                                    </div>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="pt-6">
                            <h4 className="text-sm font-semibold mb-4 text-slate-700">Submit Adjustments</h4>
                            <div className="flex flex-col sm:flex-row gap-4">
                                <Input
                                    type="number"
                                    min="1"
                                    placeholder="Enter amount (e.g. 5000)"
                                    value={amount}
                                    onChange={(e) => setAmount(Number(e.target.value))}
                                    className="sm:max-w-[200px]"
                                />
                                <div className="flex gap-2 w-full sm:w-auto">
                                    <Button 
                                        variant="default" 
                                        className="gap-2 sm:flex-1 bg-emerald-600 hover:bg-emerald-700"
                                        onClick={() => handleAdjust('add')}
                                        disabled={!amount || amount <= 0}
                                    >
                                        <PlusCircle className="w-4 h-4" /> Issue Credits
                                    </Button>
                                    <Button 
                                        variant="outline" 
                                        className="gap-2 sm:flex-1 border-rose-200 hover:bg-rose-50 hover:text-rose-700 text-rose-600 focus:bg-rose-50"
                                        onClick={() => handleAdjust('deduct')}
                                        disabled={!amount || amount <= 0}
                                    >
                                        <MinusCircle className="w-4 h-4" /> Revoke
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="col-span-full md:col-span-2 border-2 border-dashed rounded-xl flex items-center justify-center p-12 text-muted-foreground">
                        Search and select a user to configure their payment wallet constraints.
                    </div>
                )}
            </div>
        </div>
    );
}
