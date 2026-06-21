// Reglages GLOBAUX par utilisateur (table user_settings).
// Pour l'instant : l'heure de bascule de journee (day_rollover_hour).

import { supabase } from "./supabase";

/** Heure de bascule du compte (0-23 ; 0 = minuit). Absente -> 0. */
export async function loadRolloverHour(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from("user_settings")
    .select("day_rollover_hour")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  const h = data?.day_rollover_hour;
  return typeof h === "number" ? h : 0;
}

/** Enregistre l'heure de bascule du compte (upsert). */
export async function saveRolloverHour(userId: string, hour: number): Promise<void> {
  const { error } = await supabase.from("user_settings").upsert(
    { user_id: userId, day_rollover_hour: hour, updated_at: new Date().toISOString() },
    { onConflict: "user_id" }
  );
  if (error) throw error;
}
