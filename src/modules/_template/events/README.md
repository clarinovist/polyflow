# events/

Domain event contracts published or consumed by this module.

Use events for cross-domain side effects such as accounting journal drafts, inventory ledger handoff, notifications, and reporting snapshots.

Events must be idempotent where they can trigger postings or stock movements.
