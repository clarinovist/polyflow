/** LLM drafting for feature proposals. Template fallback when LLM unavailable. */
import OpenAI from 'openai';

function getLLMClient() {
    return new OpenAI({
        apiKey: process.env.LLM_API_KEY || '',
        baseURL: process.env.LLM_BASE_URL || 'http://localhost:11434/v1',
    });
}

export type ClusterForDraft = {
    canonicalRequest: string;
    sampleRequests: string[];
    uniqueUsers: number;
    tenantIds: string[];
    suggestedModule: string | null;
};

export type ProposalDraft = {
    title: string;
    problemMd: string;
    evidenceMd: string;
    impactedModules: string[];
};

export function buildTemplateDraft(cluster: ClusterForDraft): ProposalDraft {
    const scope = cluster.tenantIds.length > 1 ? cluster.tenantIds.length + " tenants" : "1 tenant";
    const title = cluster.canonicalRequest.length > 90 ? cluster.canonicalRequest.slice(0, 87) + "..." : cluster.canonicalRequest;
    return {
        title,
        problemMd: "Permintaan dari " + cluster.uniqueUsers + " user (" + scope + ").\n\n" + cluster.canonicalRequest,
        evidenceMd: "Sampel permintaan (" + cluster.sampleRequests.length + "):\n- " + cluster.sampleRequests.join("\n- "),
        impactedModules: cluster.suggestedModule && cluster.suggestedModule !== "global" ? [cluster.suggestedModule] : [],
    };
}

function safeParseDraft(text: string): ProposalDraft | null {
    try {
        const start = text.indexOf("{");
        const end = text.lastIndexOf("}");
        if (start < 0 || end <= start) return null;
        const obj = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
        if (typeof obj.title !== "string" || typeof obj.problemMd !== "string") return null;
        return {
            title: String(obj.title).slice(0, 120),
            problemMd: String(obj.problemMd).slice(0, 4000),
            evidenceMd: typeof obj.evidenceMd === "string" ? String(obj.evidenceMd).slice(0, 4000) : "",
            impactedModules: Array.isArray(obj.impactedModules) ? obj.impactedModules.filter((m): m is string => typeof m === "string").slice(0, 5) : [],
        };
    } catch {
        return null;
    }
}

export async function generateProposalDraft(cluster: ClusterForDraft): Promise<ProposalDraft | null> {
    try {
        const client = getLLMClient();
        const samples = cluster.sampleRequests.slice(0, 5).join("\n- ");
        const completion = await client.chat.completions.create({
            model: process.env.LLM_MODEL || "deepseek-r1:7b",
            response_format: { type: "json_object" },
            messages: [
                {
                    role: "system",
                    content: "Kamu analis produk Polyflow ERP (pabrik plastik, Indonesia). Tulis draf usulan fitur ringkas, faktual, tanpa mengarang angka. Output HANYA JSON: title, problemMd (masalah + konteks), evidenceMd (bukti dari sampel), impactedModules (array modul).",
                },
                {
                    role: "user",
                    content: "Canonical: " + cluster.canonicalRequest + "\nDiminta " + cluster.uniqueUsers + " user, " + cluster.tenantIds.length + " tenant. Modul: " + (cluster.suggestedModule || "global") + "\nSampel:\n- " + samples,
                },
            ],
        });
        const text = completion.choices[0]?.message?.content || "";
        return safeParseDraft(text);
    } catch {
        return null;
    }
}
