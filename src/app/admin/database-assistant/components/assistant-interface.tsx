'use client';

import { useState, useEffect } from 'react';
import { generateAndRunQuery } from '@/actions/analytics-assistant';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Send, Database, AlertCircle, RotateCcw, Sparkles, Clock } from 'lucide-react';

export function AssistantInterface() {
    const [question, setQuestion] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [result, setResult] = useState<{ sql?: string, data?: any[], error?: string } | null>(null);
    const [history, setHistory] = useState<string[]>([]);

    // Load history on mount (Client-side only)
    useEffect(() => {
        const saved = localStorage.getItem('polyflow_query_history');
        if (saved) {
            try {
                setHistory(JSON.parse(saved).slice(0, 8)); // Limit to last 8
            } catch (e) {
                console.error("Failed to parse history", e);
            }
        }
    }, []);

    const saveToHistory = (query: string) => {
        const newHistory = [query, ...history.filter(h => h !== query)].slice(0, 8);
        setHistory(newHistory);
        localStorage.setItem('polyflow_query_history', JSON.stringify(newHistory));
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!question.trim()) return;

        setIsLoading(true);
        setResult(null);

        try {
            const response = await generateAndRunQuery(question);
            setResult(response.success
                ? { sql: response.sql, data: Array.isArray(response.data) ? response.data : [response.data] }
                : { error: response.error }
            );

            if (response.success) {
                saveToHistory(question);
            }

        } catch (_err) {
            setResult({ error: "Failed to communicate with the server." });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
                {/* Main Query Section */}
                <div className="space-y-6">
                    <Card className="w-full border-none bg-zinc-950 shadow-2xl overflow-hidden ring-1 ring-white/10">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 via-primary to-blue-500 opacity-50" />
                        <CardHeader className="pb-4">
                            <CardTitle className="flex items-center gap-2 text-xl font-black tracking-tighter uppercase text-white">
                                <div className="p-1.5 rounded bg-primary/20 ring-1 ring-primary/40">
                                    <Sparkles className="h-4 w-4 text-primary animate-pulse" />
                                </div>
                                Ask the Database
                            </CardTitle>
                            <CardDescription className="text-xs font-bold uppercase tracking-wider text-muted-foreground/60">
                                Query production and ERP data using natural language.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <form onSubmit={handleSubmit} className="relative group">
                                <div className="absolute -inset-0.5 bg-gradient-to-r from-primary to-emerald-500 rounded-lg blur opacity-20 group-focus-within:opacity-40 transition duration-500" />
                                <div className="relative flex gap-3 p-1.5 bg-zinc-900 border border-zinc-800 rounded-lg">
                                    <Input
                                        placeholder="e.g., Show me the top 5 customers..."
                                        value={question}
                                        onChange={(e) => setQuestion(e.target.value)}
                                        disabled={isLoading}
                                        className="flex-1 bg-transparent border-none focus-visible:ring-0 text-white placeholder:text-zinc-600 font-medium"
                                    />
                                    <Button
                                        type="submit"
                                        disabled={isLoading || !question.trim()}
                                        className="bg-primary hover:bg-primary/90 text-primary-foreground font-black uppercase tracking-widest text-[10px] h-10 px-6 shadow-[0_0_15px_rgba(var(--primary),0.3)]"
                                    >
                                        {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-3.5 w-3.5" />}
                                        Ask
                                    </Button>
                                </div>
                            </form>

                            <div>
                                <p className="text-[10px] text-muted-foreground/50 mb-3 font-black uppercase tracking-[0.2em]">Suggested Templates</p>
                                <div className="flex flex-wrap gap-2">
                                    {[
                                        "Show me the top 5 customers by total sales amount",
                                        "List all production orders with status 'IN_PROGRESS'",
                                        "What products have stock quantity below 50?",
                                        "Show total sales amount for each month in 2024",
                                        "List all active machines and their locations",
                                        "Show me unpaid invoices with total amount > 1M"
                                    ].map((template, i) => (
                                        <Button
                                            key={i}
                                            variant="outline"
                                            size="sm"
                                            className="text-[10px] font-bold h-auto py-2 px-4 whitespace-normal text-left bg-zinc-900/50 border-zinc-800 hover:bg-zinc-800 hover:border-zinc-700 transition-all text-zinc-300 rounded-md"
                                            onClick={() => setQuestion(template)}
                                        >
                                            {template}
                                        </Button>
                                    ))}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Results Section */}
                    {result && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
                            {result.error && (
                                <Alert variant="destructive" className="bg-rose-500/10 border-rose-500/50">
                                    <AlertCircle className="h-4 w-4" />
                                    <AlertTitle className="font-black uppercase tracking-widest text-[10px]">Query Error</AlertTitle>
                                    <AlertDescription className="text-sm font-medium">{result.error}</AlertDescription>
                                </Alert>
                            )}

                            {result.sql && (
                                <Card className="bg-zinc-900/50 border-zinc-800 border-dashed backdrop-blur-sm overflow-hidden">
                                    <CardHeader className="py-3 px-4 bg-zinc-900/80 border-b border-zinc-800">
                                        <CardTitle className="text-[10px] font-black text-primary flex items-center gap-2 uppercase tracking-widest leading-none">
                                            <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                                            Generated Engine Query
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="py-4 px-4 font-mono">
                                        <div className="relative">
                                            <div className="absolute right-0 top-0 text-[10px] font-black text-zinc-700 uppercase tracking-widest select-none">SQL-ENGINE-V2</div>
                                            <pre className="text-xs text-white/90 whitespace-pre-wrap leading-relaxed">{result.sql}</pre>
                                        </div>
                                    </CardContent>
                                </Card>
                            )}

                            {result.data && (
                                <Card className="border-none bg-zinc-900/40 shadow-xl overflow-hidden ring-1 ring-white/5">
                                    <CardHeader className="py-4 px-5 bg-zinc-900/60 border-b border-white/[0.03]">
                                        <div className="flex items-center justify-between">
                                            <CardTitle className="text-xs font-black uppercase tracking-widest flex items-center gap-2">
                                                <div className="p-1 px-1.5 rounded bg-emerald-500/20 text-emerald-500 border border-emerald-500/30 text-[9px]">
                                                    {result.data.length} RECORDS
                                                </div>
                                                Query Result
                                            </CardTitle>
                                            <div className="text-[10px] font-black text-muted-foreground/40 uppercase tracking-widest">Live Response</div>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="p-0 overflow-auto max-h-[600px] custom-scrollbar">
                                        {result.data.length > 0 ? (
                                            <Table>
                                                <TableHeader className="bg-zinc-950/50">
                                                    <TableRow className="border-b border-white/[0.03] hover:bg-transparent">
                                                        {Object.keys(result.data[0]).map((key) => (
                                                            <TableHead key={key} className="whitespace-nowrap font-black text-[10px] uppercase tracking-widest text-zinc-500 h-10 px-5">{key}</TableHead>
                                                        ))}
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {result.data.map((row, i) => (
                                                        <TableRow key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors group">
                                                            {Object.values(row).map((value, j) => (
                                                                <TableCell key={j} className="whitespace-nowrap text-xs py-3 px-5 text-white/70 group-hover:text-white transition-colors">
                                                                    {typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value)}
                                                                </TableCell>
                                                            ))}
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        ) : (
                                            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground/30">
                                                <Database className="h-10 w-10 mb-4 opacity-10" />
                                                <span className="text-xs font-black uppercase tracking-[0.2em]">Zero Records Found</span>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            )}
                        </div>
                    )}
                </div>

                {/* Sidebar: History */}
                <div className="space-y-4">
                    <Card className="h-full border-none shadow-none bg-zinc-900/20 backdrop-blur-md ring-1 ring-white/5 lg:ring-1 lg:shadow-xl lg:bg-zinc-900/30">
                        <CardHeader className="pb-3 border-b border-white/[0.03]">
                            <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2 text-zinc-500">
                                <RotateCcw className="h-3.5 w-3.5" />
                                Query Log
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-2 pt-4">
                            {history.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground/20">
                                    <Clock className="h-4 w-4 mb-2 opacity-30" />
                                    <span className="text-[9px] font-black uppercase tracking-widest">No history</span>
                                </div>
                            ) : (
                                <div className="space-y-1">
                                    {history.map((h, i) => (
                                        <button
                                            key={i}
                                            onClick={() => setQuestion(h)}
                                            className="w-full text-left text-xs p-3 rounded-lg hover:bg-primary/10 hover:text-white transition-all group relative overflow-hidden"
                                            title={h}
                                        >
                                            <div className="flex items-start gap-2">
                                                <div className="mt-1 h-1 w-1 rounded-full bg-zinc-700 group-hover:bg-primary transition-colors shrink-0" />
                                                <span className="truncate text-[11px] font-medium leading-tight text-zinc-400 group-hover:text-zinc-100">{h}</span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}

