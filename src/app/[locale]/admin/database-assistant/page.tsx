import { AssistantInterface } from "./components/assistant-interface";
import { PageHeader } from "@/components/ui/page-header";

export default function DatabaseAssistantPage() {
    return (
        <div className="container mx-auto py-8 space-y-8">
            <PageHeader
                title="AI Production Analytics Assistant"
                description="Query your production and ERP data securely using natural language."
            />

            <AssistantInterface />
        </div>
    );
}
