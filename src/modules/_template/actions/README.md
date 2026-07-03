# actions/

Thin Server Actions or API adapters for the module.

Responsibilities:

- authenticate/authorize via existing auth helpers or module policy
- parse input with schema
- call service/use case
- handle `revalidatePath` or response mapping
- return stable UI-friendly result

Do not place core business logic here.
