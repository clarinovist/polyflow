'use client';

import { useState, useEffect } from 'react';
import { generateAndRunQuery } from '@/actions/analytics-assistant';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Send, Terminal, Database, AlertCircle, CheckCircle2, RotateCcw } from 'lucide-react';

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
            <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
                {/* Main Query Section */}
                <div className="space-y-6">
                    <Card className="w-full">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Terminal className="h-5 w-5 text-primary" />
                                Ask the Database
                            </CardTitle>
                            <CardDescription>
                                Ask questions about your data in plain English.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleSubmit} className="flex gap-4">
                                <Input
                                    placeholder="e.g., Show me the top 5 customers..."
                                    value={question}
                                    onChange={(e) => setQuestion(e.target.value)}
                                    disabled={isLoading}
                                    className="flex-1"
                                />
                                <Button type="submit" disabled={isLoading || !question.trim()}>
                                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                                    Ask
                                </Button>
                            </form>

                            <div className="mt-6">
                                <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wider">Suggested Templates</p>
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
                                            className="text-xs h-auto py-1.5 px-3 whitespace-normal text-left"
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
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-4">
                            {result.error && (
                                <Alert variant="destructive">
                                    <AlertCircle className="h-4 w-4" />
                                    <AlertTitle>Error</AlertTitle>
                                    <AlertDescription>{result.error}</AlertDescription>
                                </Alert>
                            )}

                            {result.sql && (
                                <Card className="bg-muted/50">
                                    <CardHeader className="py-3">
                                        <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                                            <Database className="h-3 w-3" /> SQL Generated
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="py-2 pb-4">
                                        <pre className="text-xs font-mono bg-black/5 p-3 rounded overflow-x-auto whitespace-pre-wrap">{result.sql}</pre>
                                    </CardContent>
                                </Card>
                            )}

                            {result.data && (
                                <Card>
                                    <CardHeader className="py-4">
                                        <CardTitle className="text-base flex items-center gap-2">
                                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                                            Results ({result.data.length})
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="overflow-auto max-h-[500px]">
                                        {result.data.length > 0 ? (
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        {Object.keys(result.data[0]).map((key) => (
                                                            <TableHead key={key} className="font-bold text-xs break-words">{key}</TableHead>
                                                        ))}
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {result.data.map((row, i) => (
                                                        <TableRow key={i}>
                                                            {Object.values(row).map((value, j) => (
                                                                <TableCell key={j} className="text-xs break-all py-3">
                                                                    {typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value)}
                                                                </TableCell>
                                                            ))}
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        ) : (
                                            <div className="text-center py-8 text-muted-foreground text-sm">No data found.</div>
                                        )}
                                    </CardContent>
                                </Card>
                            )}
                        </div>
                    )}
                </div>

                {/* Sidebar: History */}
                <div className="space-y-4">
                    <Card className="h-full border-none shadow-none bg-transparent lg:border lg:shadow lg:bg-card">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-semibold flex items-center gap-2">
                                <RotateCcw className="h-4 w-4 text-muted-foreground" />
                                Recent Queries
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {history.length === 0 ? (
                                <p className="text-xs text-muted-foreground italic">No recent queries yet.</p>
                            ) : (
                                <div className="space-y-2">
                                    {history.map((h, i) => (
                                        <button
                                            key={i}
                                            onClick={() => setQuestion(h)}
                                            className="w-full text-left text-xs p-2 rounded-md hover:bg-muted transition-colors truncate block border border-transparent hover:border-border"
                                            title={h}
                                        >
                                            {h}
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

