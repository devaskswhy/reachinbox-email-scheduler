import Papa from 'papaparse';

/**
 * Deliberately permissive: this is an extraction pass over messy CRM exports,
 * not RFC-5322 validation. The backend re-validates every address with Zod, so
 * the cost of letting something odd through here is a clear 400, whereas an
 * over-strict regex silently drops real leads.
 */
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

export interface ParsedRecipients {
  /** Unique, lowercased addresses in first-seen order. */
  emails: string[];
  /** Non-empty lines that contained no recognisable address. */
  skippedLines: number;
  /** Addresses dropped because the same one appeared earlier. */
  duplicates: number;
  /** Non-empty lines examined. */
  scannedLines: number;
}

const EMPTY: ParsedRecipients = {
  emails: [],
  skippedLines: 0,
  duplicates: 0,
  scannedLines: 0,
};

/** Extracts addresses from already-split lines, tracking what was discarded. */
function extractFromLines(lines: readonly string[]): ParsedRecipients {
  const seen = new Set<string>();
  const emails: string[] = [];
  let skippedLines = 0;
  let duplicates = 0;
  let scannedLines = 0;

  for (const line of lines) {
    if (line.trim() === '') continue;
    scannedLines += 1;

    const matches = line.match(EMAIL_PATTERN);
    if (matches === null) {
      // A header row like "name,email" lands here too, which is correct: it
      // holds no address, so it is skipped rather than treated as a lead.
      skippedLines += 1;
      continue;
    }

    for (const match of matches) {
      const normalised = match.toLowerCase();
      if (seen.has(normalised)) {
        duplicates += 1;
        continue;
      }
      seen.add(normalised);
      emails.push(normalised);
    }
  }

  return { emails, skippedLines, duplicates, scannedLines };
}

export function parseCsv(content: string): ParsedRecipients {
  // header: false - a lead file may have no header, and the address is not
  // reliably in a column called "email". Every cell is scanned instead.
  const { data } = Papa.parse<string[]>(content, {
    header: false,
    skipEmptyLines: true,
  });

  const lines = data.map((row) => (Array.isArray(row) ? row.join(' ') : String(row)));
  return extractFromLines(lines);
}

export function parseTxt(content: string): ParsedRecipients {
  return extractFromLines(content.split(/\r?\n/));
}

export const ACCEPTED_EXTENSIONS = ['.csv', '.txt'] as const;

export function isAcceptedFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

/** Routes to the CSV or line-split parser based on the file's extension. */
export async function parseRecipientFile(file: File): Promise<ParsedRecipients> {
  if (!isAcceptedFile(file)) return EMPTY;

  const content = await file.text();
  return file.name.toLowerCase().endsWith('.csv') ? parseCsv(content) : parseTxt(content);
}
