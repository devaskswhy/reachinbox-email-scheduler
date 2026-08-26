import { redirect } from 'next/navigation';

/** Root is not a real destination; middleware decides where the user belongs. */
export default function HomePage() {
  redirect('/dashboard');
}
