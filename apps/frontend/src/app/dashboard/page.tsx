import { redirect } from 'next/navigation';

/** /dashboard has no view of its own; Scheduled is the default tab. */
export default function DashboardIndexPage() {
  redirect('/dashboard/scheduled');
}
