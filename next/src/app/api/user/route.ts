import { requireAuth } from '@/lib/auth';

export async function GET() {
  const auth = await requireAuth();
  if ('error' in auth && auth.error) return auth.error;
  return Response.json(auth.profile);
}
