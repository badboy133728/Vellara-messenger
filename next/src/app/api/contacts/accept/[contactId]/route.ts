import { requireAuth } from '@/lib/auth';
import { publishUserContactRequestAccepted } from '@/lib/realtime/publish';

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

  const { error: acceptError } = await supabase
    .from('user_contacts')
    .update({ status: 'accepted' })
    .eq('id', request.id);

  if (acceptError) {
    return Response.json({ message: 'Не удалось принять заявку' }, { status: 500 });
  }

  const { data: reverse } = await supabase
    .from('user_contacts')
    .select('id')
    .eq('user_id', user.id)
    .eq('contact_id', senderId)
    .maybeSingle();

  if (reverse) {
    const { error: reverseError } = await supabase
      .from('user_contacts')
      .update({ status: 'accepted' })
      .eq('id', reverse.id);
    if (reverseError) {
      return Response.json({ message: 'Не удалось добавить контакт' }, { status: 500 });
    }
  } else {
    const { error: insertError } = await supabase.from('user_contacts').insert({
      user_id: user.id,
      contact_id: senderId,
      status: 'accepted',
    });
    if (insertError) {
      return Response.json({ message: 'Не удалось добавить контакт' }, { status: 500 });
    }
  }

  await publishUserContactRequestAccepted(senderId, {
    contact_id: user.id,
    name: profile.name,
  });

  return Response.json({ message: 'Контакт принят' });
}
