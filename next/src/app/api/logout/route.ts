import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/route-handler';

export async function POST(request: NextRequest) {
  const { supabase, withCookies } = createRouteHandlerClient(request);
  await supabase.auth.signOut();
  return withCookies(NextResponse.json({ message: 'Вы вышли из системы' }));
}
