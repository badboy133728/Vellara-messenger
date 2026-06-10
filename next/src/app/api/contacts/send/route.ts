import { requireAuth } from '@/lib/auth';
import { notifyContactRequestPush } from '@/lib/push/notify';
import { broadcastToUser } from '@/lib/realtime/broadcast';

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ('error' in auth && auth.error) return auth.error;
  const { user, profile, supabase } = auth;

  const { contact_id } = await request.json();
  if (!contact_id) return Response.json({ message: 'contact_id required' }, { status: 422 });
  if (contact_id === user.id) {
    return Response.json({ message: 'Нельзя добавить себя' }, { status: 422 });
  }

  const { data: existing } = await supabase
    .from('user_contacts')
    .select('id')
    .eq('user_id', user.id)
    .eq('contact_id', contact_id)
    .in('status', ['pending', 'accepted'])
    .maybeSingle();

  if (existing) {
    return Response.json({ message: 'Уже отправлена заявка или контакт добавлен' }, { status: 409 });
  }

  const { error: insertError } = await supabase.from('user_contacts').insert({
    user_id: user.id,
    contact_id,
    status: 'pending',
  });

  if (insertError) {
    return Response.json({ message: 'Не удалось отправить заявку' }, { status: 500 });
  }

  const senderName = `${profile.name} ${profile.last_name}`.trim();

  await broadcastToUser(supabase, contact_id, 'ContactRequestSent', {
    sender_id: user.id,
    name: profile.name,
    last_name: profile.last_name,
    email: profile.email,
    avatar: profile.avatar,
  });

  void notifyContactRequestPush(contact_id, senderName, user.id);

  return Response.json({ message: 'Заявка отправлена' }, { status: 201 });
}
