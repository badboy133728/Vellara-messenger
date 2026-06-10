import { requireAuth } from '@/lib/auth';
import { broadcastToUser } from '@/lib/realtime/broadcast';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ contactId: string }> },
) {
  const auth = await requireAuth();
  if ('error' in auth && auth.error) return auth.error;
  const { user, supabase } = auth;
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

  const admin = createAdminClient();
  const { error } = await admin.from('user_contacts').delete().eq('id', request.id);

  if (error) {
    return Response.json({ message: 'Не удалось отклонить заявку' }, { status: 500 });
  }

  void broadcastToUser(supabase, user.id, 'ContactRequestRejected', { sender_id: senderId });
  void broadcastToUser(supabase, senderId, 'ContactRequestRejected', { contact_id: user.id });

  return Response.json({ message: 'Заявка отклонена' });
}
