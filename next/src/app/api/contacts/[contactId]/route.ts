import { requireAuth } from '@/lib/auth';
import { publishUserContactRemoved } from '@/lib/realtime/publish';
import { createAdminClient } from '@/lib/supabase/admin';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ contactId: string }> },
) {
  const auth = await requireAuth();
  if ('error' in auth && auth.error) return auth.error;
  const { user, supabase } = auth;
  const { contactId } = await params;

  const { error: ownError } = await supabase
    .from('user_contacts')
    .delete()
    .eq('user_id', user.id)
    .eq('contact_id', contactId);

  if (ownError) {
    return Response.json({ message: 'Не удалось удалить контакт' }, { status: 500 });
  }

  const admin = createAdminClient();
  await admin.from('user_contacts').delete().eq('user_id', contactId).eq('contact_id', user.id);

  await Promise.all([
    publishUserContactRemoved(contactId, { contact_id: user.id }),
    publishUserContactRemoved(user.id, { contact_id: contactId }),
  ]);

  return Response.json({ message: 'Контакт удалён' });
}
