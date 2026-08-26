import { PageHeading } from '@/components/page-heading';
import { ScheduledEmailsTable } from '@/components/scheduled-emails-table';

export default function ScheduledEmailsPage() {
  return (
    <PageHeading
      title="Scheduled"
      description="Queued and in-flight sends, newest first. Refreshes on its own."
    >
      <ScheduledEmailsTable />
    </PageHeading>
  );
}
