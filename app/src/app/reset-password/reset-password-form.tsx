'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Status = { kind: 'idle' } | { kind: 'submitting' } | { kind: 'error'; message: string };

export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setStatus({ kind: 'error', message: 'La contraseña debe tener al menos 8 caracteres.' });
      return;
    }
    if (password !== confirm) {
      setStatus({ kind: 'error', message: 'Las contraseñas no coinciden.' });
      return;
    }
    setStatus({ kind: 'submitting' });
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setStatus({ kind: 'error', message: error.message });
      return;
    }
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="password" className="text-sm font-medium">
          Nueva contraseña
        </label>
        <Input
          id="password"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          autoFocus
          disabled={status.kind === 'submitting'}
        />
        <p className="text-xs text-muted-foreground">Mínimo 8 caracteres.</p>
      </div>
      <div className="space-y-2">
        <label htmlFor="confirm" className="text-sm font-medium">
          Repetir contraseña
        </label>
        <Input
          id="confirm"
          type="password"
          placeholder="••••••••"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          disabled={status.kind === 'submitting'}
        />
      </div>
      {status.kind === 'error' && <p className="text-sm text-destructive">{status.message}</p>}
      <Button type="submit" className="w-full" disabled={status.kind === 'submitting'}>
        {status.kind === 'submitting' ? 'Guardando...' : 'Guardar contraseña'}
      </Button>
    </form>
  );
}
