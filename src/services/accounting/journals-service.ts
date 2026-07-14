// Re-exports for backward compatibility.
// New code should import from:
//   journal-closing (createClosingJournalEntry, createYearEndClosingEntry)
//   journal-posting (createJournalEntry, postJournal, postBulkJournals, voidJournal, reverseJournal, createBulkJournalEntries)
//   journal-queries (getJournals, getJournalById)

export {
  createClosingJournalEntry,
  createYearEndClosingEntry,
} from "./journal-closing";

export {
  createJournalEntry,
  postJournal,
  postBulkJournals,
  voidJournal,
  reverseJournal,
  createBulkJournalEntries,
  updateDraftJournal,
  createDirectLaborJournal,
  updateDirectLaborJournal,
  buildDirectLaborLines,
  createDetailJournal,
  updateDetailJournal,
  buildDetailJournalLines,
} from "./journal-posting";
export type { DirectLaborInput, DetailJournalInput } from "./journal-posting";

export { getJournals, getJournalById } from "./journal-queries";
