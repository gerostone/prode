'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Mode = 'login' | 'signup';
type Status = { kind: 'idle' } | { kind: 'submitting' } | { kind: 'error'; message: string };

const ERROR_COPY: Record<string, string> = {
  auth_failed: 'No pudimos validar tu sesión. Intentá ingresar de nuevo.',
  recovery_failed: 'El link de recuperación no es válido o expiró.',
};

export function LoginForm({ next, error }: { next?: string; error?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<Status>(
    error ? { kind: 'error', message: ERROR_COPY[error] ?? 'Algo salió mal. Probá de nuevo.' } : { kind: 'idle' },
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes('@')) {
      setStatus({ kind: 'error', message: 'Ingresá un email válido.' });
      return;
    }
    if (password.length < 8) {
      setStatus({ kind: 'error', message: 'La contraseña debe tener al menos 8 caracteres.' });
      return;
    }

    setStatus({ kind: 'submitting' });
    const supabase = createSupabaseBrowserClient();

    const { error } =
      mode === 'login'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

    if (error) {
      setStatus({ kind: 'error', message: translateError(error.message) });
      return;
    }

    router.push((next ?? '/dashboard') as Route);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 rounded-md bg-muted p-1">
        <button
          type="button"
          onClick={() => setMode('login')}
          className={`rounded-sm px-3 py-1.5 text-sm font-medium transition ${
            mode === 'login' ? 'bg-background shadow-sm' : 'text-muted-foreground'
          }`}
        >
          Iniciar sesión
        </button>
        <button
          type="button"
          onClick={() => setMode('signup')}
          className={`rounded-sm px-3 py-1.5 text-sm font-medium transition ${
            mode === 'signup' ? 'bg-background shadow-sm' : 'text-muted-foreground'
          }`}
        >
          Crear cuenta
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <Input
            id="email"
            type="email"
            placeholder="tu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            disabled={status.kind === 'submitting'}
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium">
            Contraseña
          </label>
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            disabled={status.kind === 'submitting'}
          />
          {mode === 'signup' && (
            <p className="text-xs text-muted-foreground">Mínimo 8 caracteres.</p>
          )}
        </div>

        {status.kind === 'error' && (
          <p className="text-sm text-destructive">{status.message}</p>
        )}

        <Button type="submit" className="w-full" disabled={status.kind === 'submitting'}>
          {status.kind === 'submitting'
            ? mode === 'login'
              ? 'Entrando...'
              : 'Creando cuenta...'
            : mode === 'login'
              ? 'Entrar'
              : 'Crear cuenta'}
        </Button>
      </form>

      {mode === 'login' && (
        <div className="text-center text-sm">
          <Link href="/forgot-password" className="text-muted-foreground hover:text-foreground">
            Olvidé mi contraseña
          </Link>
        </div>
      )}
    </div>
  );
}

function translateError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Email o contraseña incorrectos.';
  if (m.includes('user already registered')) return 'Ese email ya tiene cuenta. Iniciá sesión.';
  if (m.includes('email rate limit')) return 'Demasiados intentos. Esperá un rato.';
  return msg;
}
