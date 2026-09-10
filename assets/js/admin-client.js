/* ============================================================
   SCOPE Internal OS — Supabase client
   ------------------------------------------------------------
   The publishable key below is designed to be public: it ships in
   browser code and grants nothing on its own. Your data is protected
   by the row-level-security policies in supabase/schema.sql, which
   reject anonymous callers entirely.

   Never put the `service_role` / secret key in this file — it
   bypasses RLS and would expose every row to anyone who views source.
   ============================================================ */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

/* Project URL and publishable key. Deliberately not exported — nothing
   outside this file needs them, and `supabase` below is the only thing
   that should ever reach a page. */
const SUPABASE_URL = 'https://zmxiagusvvhicgoyrklq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_rJxQ-9gJPgdJn_KQJ4ax9A_V5NoynrU';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'scope.admin.auth',
  },
});
