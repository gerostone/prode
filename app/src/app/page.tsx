import { redirect } from 'next/navigation';

// Landing: el middleware se encarga de redirigir a /login si no hay sesión.
// Si hay sesión, mandamos directo al dashboard.
export default function Home() {
  redirect('/dashboard');
}
