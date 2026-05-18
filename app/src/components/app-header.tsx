'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { createSupabaseBrowserClient } from '@/lib/supabase-client';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';
import type { UserRole } from '@/lib/database.types';

export function AppHeader({ email, role }: { email: string; role: UserRole | null }) {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <header className="border-b bg-card">
      <div className="container mx-auto flex h-14 items-center justify-between gap-4">
        <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
          <span className="text-xl">⚽</span>
          <span>Prode 2026</span>
        </Link>
        <nav className="hidden gap-4 text-sm sm:flex">
          <Link href="/dashboard" className="text-muted-foreground hover:text-foreground">
            Dashboard
          </Link>
          <Link href="/eventos/1" className="text-muted-foreground hover:text-foreground">
            Evento 1
          </Link>
          {role === 'admin' && (
            <Link href={"/admin" as Route} className="text-muted-foreground hover:text-foreground">
              Admin
            </Link>
          )}
          {/* Próximas fases: <Link href="/leaderboard">Leaderboard</Link> */}
        </nav>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-muted-foreground sm:inline">{email}</span>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Salir
          </Button>
        </div>
      </div>
    </header>
  );
}
