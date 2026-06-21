import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { OperatorProductivityItem } from '@/types/analytics';
import { analyticsLabels } from '@/lib/labels';
import { Trophy, Award, Medal } from 'lucide-react';

interface Props {
    data: OperatorProductivityItem[];
}

export function OperatorLeaderboard({ data }: Props) {
    // Sort by output descending (usually handled by backend, but ensuring here)
    const sortedData = [...data].sort((a, b) => b.totalQuantityProduced - a.totalQuantityProduced);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Top 3 Podium Cards - Only show if we have data */}
            {sortedData.length >= 1 && (
                <Card className="lg:col-span-2 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-blue-100 dark:border-blue-800/50">
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-blue-800 dark:text-blue-400">
                            <Trophy className="h-5 w-5 text-yellow-500 dark:text-yellow-400" />
                            Top Performers
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col md:flex-row justify-around items-end gap-6 pt-4">
                        {/* 2nd Place */}
                        {sortedData[1] && (
                            <div className="flex flex-col items-center p-4 bg-white/60 dark:bg-zinc-900/60 rounded-xl shadow-sm border border-blue-100 dark:border-blue-800/50 w-full md:w-1/3 order-2 md:order-1 scale-95">
                                <div className="relative">
                                    <Avatar className="h-16 w-16 border-2 border-slate-300 dark:border-slate-600">
                                        <AvatarFallback className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xl font-bold">
                                            {sortedData[1].operatorName.substring(0, 2).toUpperCase()}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="absolute -bottom-2 -right-2 bg-slate-400 dark:bg-slate-500 text-white rounded-full p-1 shadow">
                                        <Medal className="h-4 w-4" />
                                    </div>
                                </div>
                                <h3 className="mt-3 font-semibold text-lg text-slate-800 dark:text-slate-200">{sortedData[1].operatorName}</h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">{sortedData[1].operatorCode}</p>
                                <div className="text-center">
                                    <div className="text-2xl font-bold text-slate-700 dark:text-slate-300">{sortedData[1].totalQuantityProduced.toLocaleString()}</div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400">units produced</div>
                                </div>
                            </div>
                        )}

                        {/* 1st Place */}
                        {sortedData[0] && (
                            <div className="flex flex-col items-center p-6 bg-white/90 dark:bg-zinc-900/90 rounded-xl shadow-md border-2 border-yellow-200 dark:border-yellow-800/50 w-full md:w-1/3 order-1 md:order-2 z-10 scale-105">
                                <div className="relative">
                                    <Avatar className="h-20 w-20 border-4 border-yellow-100 dark:border-yellow-800/50 ring-2 ring-yellow-400 dark:ring-yellow-500">
                                        <AvatarFallback className="bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 text-2xl font-bold">
                                            {sortedData[0].operatorName.substring(0, 2).toUpperCase()}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="absolute -bottom-3 -right-2 bg-yellow-400 dark:bg-yellow-500 text-yellow-900 dark:text-yellow-900 rounded-full p-1.5 shadow-lg">
                                        <Trophy className="h-5 w-5" />
                                    </div>
                                </div>
                                <h3 className="mt-4 font-bold text-xl text-yellow-900 dark:text-yellow-200">{sortedData[0].operatorName}</h3>
                                <p className="text-sm text-yellow-700 dark:text-yellow-400 mb-3">{sortedData[0].operatorCode}</p>
                                <div className="text-center">
                                    <div className="text-3xl font-black text-yellow-600 dark:text-yellow-400">{sortedData[0].totalQuantityProduced.toLocaleString()}</div>
                                    <div className="text-sm font-medium text-yellow-700/70 dark:text-yellow-400/70">units produced</div>
                                </div>
                            </div>
                        )}

                        {/* 3rd Place */}
                        {sortedData[2] && (
                            <div className="flex flex-col items-center p-4 bg-white/60 dark:bg-zinc-900/60 rounded-xl shadow-sm border border-orange-100 dark:border-orange-800/50 w-full md:w-1/3 order-3 scale-95">
                                <div className="relative">
                                    <Avatar className="h-16 w-16 border-2 border-orange-200 dark:border-orange-800/50">
                                        <AvatarFallback className="bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 text-xl font-bold">
                                            {sortedData[2].operatorName.substring(0, 2).toUpperCase()}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="absolute -bottom-2 -right-2 bg-orange-400 dark:bg-orange-500 text-white rounded-full p-1 shadow">
                                        <Medal className="h-4 w-4" />
                                    </div>
                                </div>
                                <h3 className="mt-3 font-semibold text-lg text-slate-800 dark:text-slate-200">{sortedData[2].operatorName}</h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">{sortedData[2].operatorCode}</p>
                                <div className="text-center">
                                    <div className="text-2xl font-bold text-slate-700 dark:text-slate-300">{sortedData[2].totalQuantityProduced.toLocaleString()}</div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400">units produced</div>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Full List Table */}
            <Card className="lg:col-span-1">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Award className="h-5 w-5 text-muted-foreground" />
                        {analyticsLabels.operatorLeaderboard}
                    </CardTitle>
                    <CardDescription>{analyticsLabels.operatorLeaderboardDesc}</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[80px]">Rank</TableHead>
                                <TableHead>Operator</TableHead>
                                <TableHead className="text-right">Orders Handled</TableHead>
                                <TableHead className="text-right">Scrap Qty</TableHead>
                                <TableHead className="text-right">Scrap Rate</TableHead>
                                <TableHead className="text-right">Total Output</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {sortedData.map((item, index) => (
                                <TableRow key={item.operatorCode}>
                                    <TableCell className="font-medium text-slate-500 dark:text-slate-400">#{index + 1}</TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-3">
                                            <Avatar className="h-8 w-8">
                                                <AvatarFallback className="text-xs">
                                                    {item.operatorName.substring(0, 2).toUpperCase()}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div>
                                                <p className="font-medium text-sm">{item.operatorName}</p>
                                                <p className="text-xs text-muted-foreground">{item.operatorCode}</p>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right">{item.ordersHandled}</TableCell>
                                    <TableCell className="text-right text-muted-foreground">{item.totalScrapQuantity.toLocaleString()}</TableCell>
                                    <TableCell className="text-right">
                                        <span className={`text-xs font-medium px-2 py-1 rounded-full ${item.scrapRate > 2 ? 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400' : 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400'}`}>
                                            {item.scrapRate}%
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-right font-bold text-slate-900 dark:text-slate-100">{item.totalQuantityProduced.toLocaleString()}</TableCell>
                                </TableRow>
                            ))}
                            {sortedData.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                        Tidak ada data operator tersedia.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
