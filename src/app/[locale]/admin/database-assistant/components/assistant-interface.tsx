'use client';

import { useState } from 'react';
import { generateAndRunQuery } from '@/actions/analytics-assistant';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Send, Terminal, Database, AlertCircle, CheckCircle2 } from 'lucide-react';

export function AssistantInterface() {
    const [question, setQuestion] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [result, setResult] = useState<{ sql?: string, data?: any[], error?: string } | null>(null);

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
        } catch (_err) {
            setResult({ error: "Failed to communicate with the server." });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Query Input Section */}
            <Card className="w-full">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Terminal className="h-5 w-5 text-primary" />
                        Ask the Database
                    </CardTitle>
                    <CardDescription>
                        Ask questions about your data in plain English. The AI will generate a safe SQL query and show you the results.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="flex gap-4">
                        <Input
                            placeholder="e.g., Show me the top 5 customers by sales volume..."
                            value={question}
                            onChange={(e) => setQuestion(e.target.value)}
                            disabled={isLoading}
                            className="flex-1"
                        />
                        <Button type="submit" disabled={isLoading || !question.trim()}>
                            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                            Ask AI
                        </Button>
                    </form>
                </CardContent>
            </Card>

            {/* Results Section */}
            {result && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

                    {/* Error Display */}
                    {result.error && (
                        <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>Error Generating Query</AlertTitle>
                            <AlertDescription>{result.error}</AlertDescription>
                        </Alert>
                    )}

                    {/* SQL Display */}
                    {result.sql && (
                        <Card className="bg-muted/50">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                    <Database className="h-4 w-4" /> Generated SQL
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <pre className="text-xs md:text-sm font-mono bg-black/5 p-4 rounded-md overflow-x-auto whitespace-pre-wrap">
                                    {result.sql}
                                </pre>
                            </CardContent>
                        </Card>
                    )}

                    {/* Data Table */}
                    {result.data && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                                    Query Results ({result.data.length} rows)
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="overflow-auto max-h-[500px]">
                                {result.data.length > 0 ? (
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                {Object.keys(result.data[0]).map((key) => (
                                                    <TableHead key={key} className="whitespace-nowrap font-bold">
                                                        {key}
                                                    </TableHead>
                                                ))}
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {result.data.map((row, i) => (
                                                <TableRow key={i}>
                                                    {Object.values(row).map((value, j) => (
                                                        <TableCell key={j} className="whitespace-nowrap">
                                                            {typeof value === 'object' && value !== null
                                                                ? JSON.stringify(value)
                                                                : String(value)
                                                            }
                                                        </TableCell>
                                                    ))}
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                ) : (
                                    <div className="text-center py-8 text-muted-foreground">
                                        No data found matching your query.
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}
                </div>
            )}
        </div>
    );
}
