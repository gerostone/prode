import { createSupabaseServerClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { AppHeader } from '@/components/app-header';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Defensa en profundidad: el middleware ya redirige, pero por las dudas.
  if (!user) redirect('/login');

  return (
    <div className="min-h-screen bg-background">
      <AppHeader email={user.email ?? ''} />
      <main className="container mx-auto py-6">{children}</main>
    </div>
  );
}
