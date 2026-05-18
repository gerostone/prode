import { redirect } from 'next/navigation';
import { getUserAndProfile } from '@/lib/auth';
import { AppHeader } from '@/components/app-header';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await getUserAndProfile();

  // Defensa en profundidad: el middleware ya redirige, pero por las dudas.
  if (!user) redirect('/login');

  return (
    <div className="min-h-screen bg-background">
      <AppHeader email={user.email ?? ''} role={profile?.role ?? null} />
      <main className="container mx-auto py-6">{children}</main>
    </div>
  );
}
