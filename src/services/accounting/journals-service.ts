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
} from "./journal-posting";

export { getJournals, getJournalById } from "./journal-queries";
