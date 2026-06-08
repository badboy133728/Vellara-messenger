import { requireAuth, isOnline } from '@/lib/auth';

export async function GET() {
  const auth = await requireAuth();
  if ('error' in auth && auth.error) return auth.error;
  const { user, supabase } = auth;

  const { data: contacts } = await supabase
    .from('user_contacts')
    .select('label, contact_id')
    .eq('user_id', user.id)
    .eq('status', 'accepted')
    .order('created_at', { ascending: false });

  const contactIds = (contacts ?? []).map((c) => c.contact_id);
  const { data: profiles } = contactIds.length
    ? await supabase.from('profiles').select('id, name, last_name, email, avatar, last_seen_at').in('id', contactIds)
    : { data: [] };
  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

  const mapped = (contacts ?? []).map((c) => {
    const contact = profileMap.get(c.contact_id);
    if (!contact) return null;
    return {
      id: contact.id,
      name: contact.name,
      last_name: contact.last_name,
      email: contact.email,
      avatar: contact.avatar,
      label: c.label,
      is_online: isOnline(contact.last_seen_at),
      last_seen_at: contact.last_seen_at,
    };
  }).filter(Boolean);

  return Response.json(mapped);
}
