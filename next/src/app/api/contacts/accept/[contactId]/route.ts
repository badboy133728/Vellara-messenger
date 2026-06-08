import { requireAuth } from '@/lib/auth';
import { broadcastToUser } from '@/lib/realtime/broadcast';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ contactId: string }> },
) {
  const auth = await requireAuth();
  if ('error' in auth && auth.error) return auth.error;
  const { user, profile, supabase } = auth;
  const { contactId: senderId } = await params;

  const { data: request } = await supabase
    .from('user_contacts')
    .select('id')
    .eq('user_id', senderId)
    .eq('contact_id', user.id)
    .eq('status', 'pending')
    .maybeSingle();

  if (!request) {
    return Response.json({ message: 'Заявка не найдена' }, { status: 404 });
  }

  await supabase
    .from('user_contacts')
    .update({ status: 'accepted' })
    .eq('id', request.id);

  await supabase.from('user_contacts').insert({
    user_id: user.id,
    contact_id: senderId,
    status: 'accepted',
  });

  await broadcastToUser(supabase, senderId, 'ContactRequestAccepted', {
    contact_id: user.id,
    name: profile.name,
  });

  return Response.json({ message: 'Контакт принят' });
}
