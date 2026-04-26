import { prisma } from "@/lib/core/prisma";
import crypto from "crypto";

const HASH_HEX_REGEX = /^[a-f0-9]{64}$/;

function hashApiKey(key: string): string {
    return crypto.createHash("sha256").update(key).digest("hex");
}

function timingSafeEqualString(a: string, b: string): boolean {
    const aHash = crypto.createHash("sha256").update(a).digest();
    const bHash = crypto.createHash("sha256").update(b).digest();
    return crypto.timingSafeEqual(aHash, bHash);
}

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
        const plainKey = `pk_${randomBytes}`;
        const hashedKey = hashApiKey(plainKey);

        let expiresAt: Date | null = null;
        if (expiresInDays) {
            expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + expiresInDays);
        }

        const apiKey = await prisma.apiKey.create({
            data: {
                key: hashedKey,
                name,
                userId,
                expiresAt,
            },
        });

        // Return plain key once at creation time. Persisted DB value stays hashed.
        return {
            ...apiKey,
            key: plainKey,
        };
    }

    /**
     * Validates an API key.
     *Returns the ApiKey object if valid, or null if invalid/expired.
     */
    static async validateApiKey(key: string) {
        const hashedInput = hashApiKey(key);

        const apiKeys = await prisma.apiKey.findMany({
            where: { isActive: true },
            include: { user: true },
        });

        for (const apiKey of apiKeys) {
            const stored = apiKey.key;
            const isHashed = HASH_HEX_REGEX.test(stored);

            const matched = isHashed
                ? timingSafeEqualString(stored, hashedInput)
                : timingSafeEqualString(stored, key);

            if (!matched) continue;
            if (apiKey.expiresAt && apiKey.expiresAt < new Date()) return null;

            return apiKey;
        }

        return null;
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
            select: {
                id: true,
                name: true,
                userId: true,
                createdAt: true,
                updatedAt: true,
                expiresAt: true,
                isActive: true,
                user: { select: { name: true, email: true } }
            },
            orderBy: { createdAt: "desc" },
        });
    }
}
