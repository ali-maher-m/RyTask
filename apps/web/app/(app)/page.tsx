import { redirect } from 'next/navigation';

/** `/` → `/my-work` (route-map). The personal hub is the default landing for a signed-in user. */
export default function AppIndexPage() {
  redirect('/my-work');
}
