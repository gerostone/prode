import Link from 'next/link';
import { ForgotPasswordForm } from './forgot-password-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2 text-center">
          <div className="text-4xl">🔑</div>
          <CardTitle>Recuperar contraseña</CardTitle>
          <CardDescription>
            Ingresá tu email y te mandamos un link para definir una nueva contraseña.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ForgotPasswordForm />
          <div className="text-center text-sm">
            <Link href="/login" className="text-muted-foreground hover:text-foreground">
              Volver al login
            </Link>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
