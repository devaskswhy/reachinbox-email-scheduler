'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { FileDropzone } from '@/components/file-dropzone';
import { FormField } from '@/components/form-field';
import { Modal } from '@/components/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { describeApiError, scheduleCampaign } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import {
  ACCEPTED_EXTENSIONS,
  parseRecipientFile,
  type ParsedRecipients,
} from '@/lib/parse-recipients';

const DEFAULT_DELAY_SECONDS = 5;
/** Far enough ahead to clear the backend's five-minute past-time tolerance. */
const DEFAULT_LEAD_MINUTES = 10;

/** `datetime-local` needs local wall-clock time, not the UTC that ISO gives. */
function toDatetimeLocalValue(date: Date): string {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function defaultStartTime(): string {
  return toDatetimeLocalValue(new Date(Date.now() + DEFAULT_LEAD_MINUTES * 60_000));
}

interface FormState {
  subject: string;
  body: string;
  startTime: string;
  delaySeconds: string;
  hourlyLimit: string;
}

const EMPTY_FORM: FormState = {
  subject: '',
  body: '',
  startTime: '',
  delaySeconds: String(DEFAULT_DELAY_SECONDS),
  hourlyLimit: '',
};

export interface ComposeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ComposeDialog({ open, onOpenChange }: ComposeDialogProps) {
  const queryClient = useQueryClient();
  const { data: session } = useSession();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [parsed, setParsed] = useState<ParsedRecipients | null>(null);
  const [fileName, setFileName] = useState<string | undefined>(undefined);
  const [parsing, setParsing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const recipientCount = parsed?.emails.length ?? 0;
  const canSubmit =
    form.subject.trim() !== '' &&
    form.body.trim() !== '' &&
    recipientCount > 0 &&
    form.startTime !== '' &&
    !submitting;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  useEffect(() => {
    if (!open) return;
    // Recompute the default on every open: a dialog opened an hour after page
    // load would otherwise carry a start time already in the past.
    setForm({ ...EMPTY_FORM, startTime: defaultStartTime() });
    setParsed(null);
    setFileName(undefined);
  }, [open]);

  const handleFile = useCallback(async (file: File) => {
    setFileName(file.name);
    setParsing(true);
    try {
      setParsed(await parseRecipientFile(file));
    } catch {
      setParsed(null);
      toast.error('Could not read that file');
    } finally {
      setParsing(false);
    }
  }, []);

  async function handleSubmit() {
    if (!canSubmit || parsed === null) return;
    setSubmitting(true);

    try {
      const delaySeconds = Number(form.delaySeconds);
      const hourlyLimit = form.hourlyLimit.trim();

      const result = await scheduleCampaign(
        {
          subject: form.subject.trim(),
          body: form.body,
          recipients: parsed.emails,
          startTime: new Date(form.startTime).toISOString(),
          delayMs: Math.round((Number.isFinite(delaySeconds) ? delaySeconds : 0) * 1000),
          ...(hourlyLimit === '' ? {} : { hourlyLimit: Number(hourlyLimit) }),
        },
        session?.user?.email,
      );

      onOpenChange(false);
      toast.success(`Scheduled ${result.jobCount} emails`, {
        description:
          result.duplicatesRemoved > 0
            ? `${result.duplicatesRemoved} duplicate recipient(s) were removed.`
            : undefined,
      });

      // Drops every cached page of the scheduled list so the new rows appear
      // on the next render rather than after the 15s poll.
      void queryClient.invalidateQueries({ queryKey: queryKeys.scheduledAll });
    } catch (error) {
      toast.error('Could not schedule campaign', {
        description: describeApiError(error),
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      dismissible={!submitting}
      title="Compose new email"
      description="Upload a lead list and schedule the campaign."
      footer={
        <>
          <Button
            variant="outline"
            disabled={submitting}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button disabled={!canSubmit} onClick={() => void handleSubmit()}>
            {submitting && <Loader2 aria-hidden className="animate-spin" />}
            {submitting
              ? 'Scheduling…'
              : `Schedule${recipientCount > 0 ? ` ${recipientCount}` : ''}`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label="Subject">
          {(props) => (
            <Input
              {...props}
              value={form.subject}
              disabled={submitting}
              placeholder="Quick question about your team"
              onChange={(event) => set('subject', event.target.value)}
            />
          )}
        </FormField>

        <FormField label="Body" hint="Plain text or HTML. Sent as the email body.">
          {(props) => (
            <Textarea
              {...props}
              rows={6}
              value={form.body}
              disabled={submitting}
              placeholder="Hi there,&#10;&#10;..."
              onChange={(event) => set('body', event.target.value)}
            />
          )}
        </FormField>

        <FormField label="Lead list">
          {() => (
            <FileDropzone
              accept={ACCEPTED_EXTENSIONS}
              fileName={fileName}
              disabled={submitting}
              onFileSelected={(file) => void handleFile(file)}
              onCleared={() => {
                setFileName(undefined);
                setParsed(null);
              }}
              summary={
                <RecipientSummary
                  parsing={parsing}
                  parsed={parsed}
                  hasFile={fileName !== undefined}
                />
              }
            />
          )}
        </FormField>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Start time" hint="Local time.">
            {(props) => (
              <Input
                {...props}
                type="datetime-local"
                value={form.startTime}
                disabled={submitting}
                onChange={(event) => set('startTime', event.target.value)}
              />
            )}
          </FormField>

          <FormField label="Delay between emails" hint="Seconds.">
            {(props) => (
              <Input
                {...props}
                type="number"
                min={0}
                value={form.delaySeconds}
                disabled={submitting}
                onChange={(event) => set('delaySeconds', event.target.value)}
              />
            )}
          </FormField>
        </div>

        <FormField
          label="Hourly limit per sender"
          optional
          hint="Leave blank to use the server default."
        >
          {(props) => (
            <Input
              {...props}
              type="number"
              min={1}
              value={form.hourlyLimit}
              disabled={submitting}
              placeholder="200"
              onChange={(event) => set('hourlyLimit', event.target.value)}
            />
          )}
        </FormField>
      </div>
    </Modal>
  );
}

function RecipientSummary({
  parsing,
  parsed,
  hasFile,
}: {
  parsing: boolean;
  parsed: ParsedRecipients | null;
  hasFile: boolean;
}) {
  if (parsing) {
    return <p className="text-xs text-muted-foreground">Reading file…</p>;
  }
  if (parsed === null || !hasFile) return null;

  const count = parsed.emails.length;

  return (
    <div aria-live="polite" className="space-y-0.5 text-xs">
      <p className={count > 0 ? 'font-medium text-foreground' : 'text-destructive'}>
        {count} valid email address{count === 1 ? '' : 'es'} detected
      </p>
      {parsed.skippedLines > 0 && (
        <p className="text-muted-foreground">
          {parsed.skippedLines} malformed line{parsed.skippedLines === 1 ? '' : 's'}{' '}
          skipped
        </p>
      )}
      {parsed.duplicates > 0 && (
        <p className="text-muted-foreground">
          {parsed.duplicates} duplicate{parsed.duplicates === 1 ? '' : 's'} removed
        </p>
      )}
    </div>
  );
}
