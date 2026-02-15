import { NextRequest, NextResponse } from "next/server";
import { ApiKeyService } from "@/services/api-key-service";

export async function validateExternalRequest(req: NextRequest) {
    const apiKeyHeader = req.headers.get("X-API-KEY");

    if (!apiKeyHeader) {
        return {
            isValid: false,
            response: NextResponse.json(
                { error: "Missing X-API-KEY header" },
                { status: 401 }
            ),
        };
    }

    const apiKey = await ApiKeyService.validateApiKey(apiKeyHeader);

    if (!apiKey) {
        return {
            isValid: false,
            response: NextResponse.json(
                { error: "Invalid or expired API Key" },
                { status: 401 }
            ),
        };
    }

    return { isValid: true, apiKey };
}
