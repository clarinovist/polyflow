import { prisma } from "@/lib/prisma";
import crypto from "crypto";

export class ApiKeyService {
    /**
     * Generates a new API key for a user or system.
     * @param name - A descriptive name for the key (e.g. "Mobile App")
     * @param userId - Optional user ID to associate with the key
     * @param expiresInDays - Optional expiration in days
     */
    static async createApiKey(name: string, userId?: string, expiresInDays?: number) {
        // Generate a secure random API key
        // Format: pk_{random_hex_string}
        const randomBytes = crypto.randomBytes(32).toString("hex");
        const key = `pk_${randomBytes}`;

        let expiresAt: Date | null = null;
        if (expiresInDays) {
            expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + expiresInDays);
        }

        const apiKey = await prisma.apiKey.create({
            data: {
                key, // In a real production app, we should hash this key before storing!
                name,
                userId,
                expiresAt,
            },
        });

        return apiKey;
    }

    /**
     * Validates an API key.
     *Returns the ApiKey object if valid, or null if invalid/expired.
     */
    static async validateApiKey(key: string) {
        const apiKey = await prisma.apiKey.findUnique({
            where: { key },
            include: { user: true },
        });

        if (!apiKey) return null;
        if (!apiKey.isActive) return null;
        if (apiKey.expiresAt && apiKey.expiresAt < new Date()) return null;

        return apiKey;
    }

    /**
     * Revokes (deactivates) an API key.
     */
    static async revokeApiKey(id: string) {
        return prisma.apiKey.update({
            where: { id },
            data: { isActive: false },
        });
    }

    /**
     * Lists all API keys.
     */
    static async listApiKeys() {
        return prisma.apiKey.findMany({
            orderBy: { createdAt: "desc" },
            include: { user: { select: { name: true, email: true } } },
        });
    }
}
