import { requireAuth } from '@/lib/auth';
import { broadcastToUser } from '@/lib/realtime/broadcast';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ contactId: string }> },
) {
  const auth = await requireAuth();
  if ('error' in auth && auth.error) return auth.error;
  const { user, supabase } = auth;
  const { contactId } = await params;

  await supabase
    .from('user_contacts')
    .delete()
    .eq('user_id', user.id)
    .eq('contact_id', contactId);

  await supabase
    .from('user_contacts')
    .delete()
    .eq('user_id', contactId)
    .eq('contact_id', user.id);

  await broadcastToUser(supabase, contactId, 'ContactRemoved', {
    contact_id: user.id,
  });

  return Response.json({ message: 'Контакт удалён' });
}
