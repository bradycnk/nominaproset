import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const isAdmin = async (supabase: SupabaseClient): Promise<boolean> => {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) return false;

  const { data: profile, error: profileError } = await supabase
    .from('perfiles_admin')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) return false;

  return profile.role === 'admin';
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    return json({ error: 'Method not allowed.' }, 405);
  }

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: 'Missing Supabase environment variables.' }, 500);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return json({ error: 'Missing Authorization header.' }, 401);
  }

  const userSupabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const canListUsers = await isAdmin(userSupabase);
  if (!canListUsers) {
    return json({ error: 'Not authorized.' }, 403);
  }

  const adminSupabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const {
      data: { users },
      error: usersError,
    } = await adminSupabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (usersError) throw usersError;

    const { data: profiles, error: profilesError } = await adminSupabase
      .from('perfiles_admin')
      .select('id, full_name, role');
    if (profilesError) throw profilesError;

    const { data: userRoles, error: rolesError } = await adminSupabase
      .from('user_roles')
      .select('user_id, roles(name)');
    if (rolesError) throw rolesError;

    const profileById = new Map((profiles || []).map((p) => [p.id, p]));
    const roleByUserId = new Map<string, string>();

    (userRoles || []).forEach((row: any) => {
      const roleName = row?.roles?.name;
      if (row?.user_id && roleName && !roleByUserId.has(row.user_id)) {
        roleByUserId.set(row.user_id, roleName);
      }
    });

    const usersWithRole = (users || []).map((user) => {
      const profile = profileById.get(user.id);
      const role = roleByUserId.get(user.id) || profile?.role || 'employee';
      return {
        ...user,
        raw_user_meta_data: {
          ...user.raw_user_meta_data,
          full_name: profile?.full_name || user.raw_user_meta_data?.full_name || null,
        },
        role,
      };
    });

    return json({ users: usersWithRole }, 200);
  } catch (error: any) {
    return json({ error: error?.message || 'Unexpected error.' }, 500);
  }
});
