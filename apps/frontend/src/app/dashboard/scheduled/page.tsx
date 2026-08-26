import { ScheduledEmailsTable } from '@/components/scheduled-emails-table';

export default function ScheduledEmailsPage() {
  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Scheduled Emails</h1>
        <p className="text-sm text-muted-foreground">
          Queued and in-flight sends, newest first.
        </p>
      </div>
      <ScheduledEmailsTable />
    </section>
  );
}
