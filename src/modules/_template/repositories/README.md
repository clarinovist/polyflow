# repositories/

Data access layer for the module.

Responsibilities:

- Prisma queries
- raw SQL for performance-critical paths
- transaction client support
- mapping DB rows to module DTOs

Avoid business workflow and UI formatting here.
