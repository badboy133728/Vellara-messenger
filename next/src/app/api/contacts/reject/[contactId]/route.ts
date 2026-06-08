import { requireAuth } from '@/lib/auth';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ contactId: string }> },
) {
  const auth = await requireAuth();
  if ('error' in auth && auth.error) return auth.error;
  const { user, supabase } = auth;
  const { contactId: senderId } = await params;

  await supabase
    .from('user_contacts')
    .delete()
    .eq('user_id', senderId)
    .eq('contact_id', user.id)
    .eq('status', 'pending');

  return Response.json({ message: 'Заявка отклонена' });
}
