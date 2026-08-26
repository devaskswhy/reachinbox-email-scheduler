/**
 * Formats an ISO timestamp in the VIEWER's timezone.
 *
 * The backend stores and returns UTC; passing the string straight through
 * would show a time that is wrong for everyone outside UTC. Intl resolves the
 * browser's zone, so no timezone is hardcoded.
 */
export function formatLocalDateTime(iso: string | null): string {
  if (iso === null) return '—';

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

/** Short timezone label so a formatted time is unambiguous. */
export function localTimeZoneLabel(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'local time';
  }
}
