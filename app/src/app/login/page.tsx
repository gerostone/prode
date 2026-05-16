import { LoginForm } from './login-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; next?: string };
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2 text-center">
          <div className="text-4xl">⚽</div>
          <CardTitle>Prode Mundial 2026</CardTitle>
          <CardDescription>
            Entrá con tu email y contraseña, o creá tu cuenta para empezar a pronosticar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm next={searchParams.next} error={searchParams.error} />
        </CardContent>
      </Card>
    </main>
  );
}
