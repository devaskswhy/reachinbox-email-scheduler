const BACKEND_URL = process.env['NEXT_PUBLIC_BACKEND_URL'] ?? 'http://localhost:4001';

export interface ScheduleCampaignPayload {
  subject: string;
  body: string;
  recipients: string[];
  /** ISO-8601 with offset. */
  startTime: string;
  delayMs: number;
  hourlyLimit?: number;
}

export interface ScheduleCampaignResponse {
  campaign: { id: string; subject: string; startTime: string };
  jobCount: number;
  duplicatesRemoved: number;
  queuedCount: number;
  pendingCount: number;
}

/** Carries the backend's own message so the UI never invents its own wording. */
export class ApiError extends Error {
  readonly status: number;
  readonly details: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

interface ErrorBody {
  error?: string;
  details?: unknown;
}

interface ZodFlattenedDetails {
  formErrors?: string[];
  fieldErrors?: Record<string, string[] | undefined>;
}

/**
 * The backend answers a Zod failure with a generic "Validation failed" plus the
 * specifics in `details`. Showing only the message would leave the user with
 * nothing to act on, so pull out the first concrete complaint.
 */
export function describeApiError(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return 'Something went wrong. Please try again.';
  }

  const details = error.details as ZodFlattenedDetails | undefined;

  const firstFieldError = Object.entries(details?.fieldErrors ?? {})
    .flatMap(([field, messages]) => (messages ?? []).map((m) => `${field}: ${m}`))
    .at(0);

  const specific = firstFieldError ?? details?.formErrors?.at(0);

  return specific === undefined ? error.message : `${error.message} — ${specific}`;
}

/**
 * Surfaces the backend's `{ error, details? }` shape verbatim. A failed request
 * that never reached the server (backend down, CORS) has no body to read, so it
 * gets an explicit connection message rather than "undefined".
 */
async function request<T>(path: string, init: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${BACKEND_URL}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init.headers },
    });
  } catch {
    throw new ApiError(0, `Could not reach the backend at ${BACKEND_URL}`);
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ErrorBody;
    throw new ApiError(
      response.status,
      body.error ?? `Request failed with status ${response.status}`,
      body.details,
    );
  }

  return (await response.json()) as T;
}

export function scheduleCampaign(
  payload: ScheduleCampaignPayload,
  userEmail?: string | null,
): Promise<ScheduleCampaignResponse> {
  return request<ScheduleCampaignResponse>('/api/campaigns/schedule', {
    method: 'POST',
    // Backend reads this for Campaign.createdBy until NextAuth session
    // verification replaces it. See backend src/lib/currentUser.ts.
    headers: userEmail != null ? { 'x-user-email': userEmail } : {},
    body: JSON.stringify(payload),
  });
}
