import { PageHeading } from '@/components/page-heading';
import { SentEmailsTable } from '@/components/sent-emails-table';

export default function SentEmailsPage() {
  return (
    <PageHeading
      title="Sent"
      description="Delivered and failed sends. Open a row to read the message."
    >
      <SentEmailsTable />
    </PageHeading>
  );
}
