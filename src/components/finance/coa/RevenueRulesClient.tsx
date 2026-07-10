'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { getRevenueRules, createRevenueRule, deleteRevenueRule } from '@/actions/finance/revenue-rules';
import { getChartOfAccounts } from '@/actions/finance/accounting';

interface RevenueRule {
    id: string;
    matchType: string;
    matchValue: string;
    accountId: string;
    accountCode: string | null;
    accountName: string | null;
    priority: number;
    isActive: boolean;
}

interface Account {
    id: string;
    code: string;
    name: string;
    type: string;
}

export function RevenueRulesClient() {
    const [rules, setRules] = useState<RevenueRule[]>([]);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [newRule, setNewRule] = useState({ matchType: 'VARIANT_NAME_CONTAINS', matchValue: '', accountCode: '', priority: 100 });

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [rulesRes, accountsRes] = await Promise.all([getRevenueRules(), getChartOfAccounts()]);
            if (rulesRes.success && rulesRes.data) setRules(rulesRes.data);
            if (accountsRes.success && accountsRes.data) setAccounts(accountsRes.data.filter((a: Account) => a.type === 'REVENUE'));
        } catch { toast.error('Failed to load data'); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    async function handleAdd() {
        if (!newRule.matchValue || !newRule.accountCode) { toast.error('Fill all fields'); return; }
        setSaving(true);
        try {
            const result = await createRevenueRule(newRule);
            if (result.success) { toast.success('Rule added'); setNewRule({ matchType: 'VARIANT_NAME_CONTAINS', matchValue: '', accountCode: '', priority: 100 }); await loadData(); }
            else toast.error(result.error || 'Failed');
        } catch { toast.error('Failed to add rule'); }
        finally { setSaving(false); }
    }

    async function handleDelete(id: string) {
        try { await deleteRevenueRule(id); toast.success('Rule deleted'); await loadData(); }
        catch { toast.error('Failed to delete'); }
    }

    if (loading) return <Card><CardContent className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></CardContent></Card>;

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader><CardTitle>Add Rule</CardTitle></CardHeader>
                <CardContent>
                    <div className="flex gap-3 items-end">
                        <Select value={newRule.matchType} onValueChange={v => setNewRule({ ...newRule, matchType: v })}>
                            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="VARIANT_NAME_CONTAINS">Variant Name Contains</SelectItem>
                                <SelectItem value="PRODUCT_NAME">Product Name Contains</SelectItem>
                            </SelectContent>
                        </Select>
                        <Input placeholder="Match value (e.g. Super)" value={newRule.matchValue} onChange={e => setNewRule({ ...newRule, matchValue: e.target.value })} className="flex-1" />
                        <Select value={newRule.accountCode} onValueChange={v => setNewRule({ ...newRule, accountCode: v })}>
                            <SelectTrigger className="w-64"><SelectValue placeholder="Revenue account" /></SelectTrigger>
                            <SelectContent>
                                {accounts.map(a => <SelectItem key={a.id} value={a.code}>{a.code} — {a.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <Input type="number" placeholder="Priority" value={newRule.priority} onChange={e => setNewRule({ ...newRule, priority: Number(e.target.value) })} className="w-24" />
                        <Button onClick={handleAdd} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}</Button>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader><CardTitle>Rules ({rules.length})</CardTitle><CardDescription>Lower priority number = higher priority. First match wins.</CardDescription></CardHeader>
                <CardContent>
                    <div className="space-y-2">
                        {rules.map(r => (
                            <div key={r.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                                <Badge variant={r.isActive ? 'default' : 'secondary'}>{r.priority}</Badge>
                                <Badge variant="outline">{r.matchType === 'VARIANT_NAME_CONTAINS' ? 'Variant' : 'Product'}</Badge>
                                <span className="flex-1 font-mono text-sm">{r.matchValue}</span>
                                <span className="text-sm text-muted-foreground">→ {r.accountCode} {r.accountName}</span>
                                <Button variant="ghost" size="sm" onClick={() => handleDelete(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                            </div>
                        ))}
                        {rules.length === 0 && <p className="text-muted-foreground text-sm">No rules configured.</p>}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
