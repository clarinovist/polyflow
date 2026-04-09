import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { ProductionExecutionService } from '@/services/production/execution-service';
import { productionOutputSchema } from '@/lib/schemas/production';

// We expect an array of valid production output objects
const bulkDailyReportSchema = z.array(productionOutputSchema);

export async function POST(req: NextRequest) {
    try {
        // Auth strategy: accept EITHER a valid API key (for device/machine integrations)
        // OR a valid NextAuth session (for calls from the kiosk frontend)
        const authHeader = req.headers.get('authorization');
        const apiKey = process.env.API_SECRET_KEY;
        const hasValidApiKey = apiKey && authHeader === `Bearer ${apiKey}`;

        // Fallback to NextAuth session (used by kiosk UI)
        const session = hasValidApiKey ? null : await auth();

        if (!hasValidApiKey && !session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();

        // Validate the incoming payload
        const parseResult = bulkDailyReportSchema.safeParse(body);
        if (!parseResult.success) {
            return NextResponse.json({
                error: 'Invalid request body',
                details: parseResult.error.format()
            }, { status: 400 });
        }

        const reports = parseResult.data;
        const results = [];
        const errors = [];

        // Note: For large bulks, we might want to do this concurrently,
        // but executing sequentially ensures we don't hit DB connection pool limits 
        // and makes debugging simpler.
        for (let i = 0; i < reports.length; i++) {
            const report = reports[i];
            try {
                // Determine a generic system user footprint or omit userId to use internal automated logic
                // Using the addProductionOutput method which handles stock updates, backflush, scrap generation, etc.
                await ProductionExecutionService.addProductionOutput(report);
                results.push({ index: i, status: 'success' });
            } catch (error: unknown) {
                console.error(`Error processing report shift entry ${i}:`, error);
                errors.push({ index: i, error: (error as Error).message || 'Failed to process report' });
            }
        }

        if (errors.length > 0) {
            return NextResponse.json({
                message: 'Partial success',
                results,
                errors
            }, { status: 207 }); // 207 Multi-Status
        }

        return NextResponse.json({ message: 'Successfully processed daily reports', count: results.length });
    } catch (error: unknown) {
        console.error('API Error /api/production/daily-report:', error);
        return NextResponse.json({ error: 'Internal Server Error', message: (error as Error).message }, { status: 500 });
    }
}
