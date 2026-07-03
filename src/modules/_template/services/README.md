# services/

Business use cases and orchestration live here.

Responsibilities:

- enforce domain invariants
- coordinate repositories in transactions
- call public contracts from other modules when needed
- publish domain events when cross-domain effects exist
- return DTOs or domain results

High-risk mutation services should have targeted tests.
