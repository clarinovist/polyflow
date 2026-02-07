# Text-to-SQL Feature Design Document

**Goal:** Enable business users to query the Polyflow database using natural language via a dashboard interface.
**Architecture:** Fine-tuned Qwen 2.5 Coder model hosted on Fireworks AI. Read-only database connection for safety.
**Tech Stack:** Fireworks AI (LLM), Next.js (UI), Prisma (DB)

## Dataset

The fine-tuning dataset has been generated and saved to `fine_tuning_dataset.jsonl`. It contains **100 Q&A pairs** covering:

| Domain | Examples |
|--------|----------|
| Sales & Customers | 20 |
| Production & BOM | 20 |
| Warehouse & Inventory | 20 |
| Finance & Accounting | 20 |
| Procurement & Suppliers | 10 |
| Master Data & Admin | 10 |

### Sample Entries

```json
// Sales
{"messages": [{"role": "user", "content": "What is the total revenue this month?"}, {"role": "assistant", "content": "SELECT SUM(\"totalAmount\") FROM \"SalesOrder\" WHERE \"orderDate\" >= date_trunc('month', CURRENT_DATE) AND status NOT IN ('DRAFT', 'CANCELLED');"}]}

// Production
{"messages": [{"role": "user", "content": "Show production orders that are waiting for material."}, {"role": "assistant", "content": "SELECT \"orderNumber\", \"plannedQuantity\", \"plannedStartDate\" FROM \"ProductionOrder\" WHERE status = 'WAITING_MATERIAL';"}]}

// Finance
{"messages": [{"role": "user", "content": "What is the total debit and credit for account code 1000?"}, {"role": "assistant", "content": "SELECT SUM(jl.debit) AS total_debit, SUM(jl.credit) AS total_credit FROM \"JournalLine\" jl JOIN \"Account\" a ON jl.\"accountId\" = a.id JOIN \"JournalEntry\" je ON jl.\"journalEntryId\" = je.id WHERE a.code = '1000' AND je.status = 'POSTED';"}]}
```

## Next Steps

1.  **User Action**: Create account at [fireworks.ai](https://fireworks.ai/) and get API Key.
2.  **Upload Dataset**: Upload `fine_tuning_dataset.jsonl` to Fireworks.
3.  **Start Fine-Tuning**: Train a model based on `Qwen 2.5-Coder-7B`.
4.  **Implement Dashboard UI**: Create `/admin/database-assistant` page.
5.  **Create Read-Only DB User**: For safe query execution.
