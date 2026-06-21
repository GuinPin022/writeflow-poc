import { useCallback, useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import { loadModels, DocModel } from "./lib/data";
import Login from "./components/Login";
import Layout from "./components/Layout";
import Overview from "./components/Overview";
import TablePage from "./components/TablePage";
import SettingsPage from "./components/SettingsPage";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [models, setModels] = useState<DocModel[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  // Session Supabase (restauree depuis localStorage, puis ecoute des changements).
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Recharge les donnees depuis Supabase (appele au demarrage et apres une ecriture).
  const reload = useCallback(async () => {
    if (!session) return;
    setLoadErr(null);
    try {
      const m = await loadModels(session.user.id);
      setModels(m);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : String(e));
    }
  }, [session]);

  // Chargement des donnees quand on est connecte.
  useEffect(() => {
    if (!session) {
      setModels(null);
      return;
    }
    void reload();
  }, [session, reload]);

  if (!authReady) return <div className="center-note">Chargement…</div>;
  if (!session) return <Login />;
  if (loadErr)
    return <div className="center-note">Erreur de chargement : {loadErr}</div>;
  if (!models) return <div className="center-note">Chargement de tes données…</div>;

  return (
    <Routes>
      <Route
        element={
          <Layout
            email={session.user.email || ""}
            models={models}
            userId={session.user.id}
            reload={reload}
          />
        }
      >
        <Route index element={<Overview />} />
        <Route path="table" element={<TablePage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
