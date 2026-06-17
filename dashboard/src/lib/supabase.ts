import { createClient } from "@supabase/supabase-js";

// Memes valeurs PUBLIQUES que l'add-in (cle anon, protegee par les RLS).
// Voir writeflow-poc/src/supabase/config.ts.
const SUPABASE_URL = "https://ngmdwyystasydswltcjz.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5nbWR3eXlzdGFzeWRzd2x0Y2p6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0NDkwMzQsImV4cCI6MjA5NzAyNTAzNH0.eR5OPNsPMOJ4erK-MaXx38K0vmoWlU2ugbTzaccaxB0";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});
