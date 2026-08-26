import { SentEmailsTable } from '@/components/sent-emails-table';

export default function SentEmailsPage() {
  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Sent Emails</h1>
        <p className="text-sm text-muted-foreground">
          Delivered and failed sends, newest first.
        </p>
      </div>
      <SentEmailsTable />
    </section>
  );
}
