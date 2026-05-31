import { useState, useEffect, useRef } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useKhataStore } from "./store/useKhataStore";
import { supabase, isSupabaseConfigured } from "./lib/supabase";
import LandingView from "./components/LandingView";
import LoginView from "./components/LoginView";
import DashboardView from "./components/DashboardView";
import LedgerView from "./components/LedgerView";

export default function App() {
  const { currentUser, isLoading, loadUserData } = useKhataStore();
  const [initializing, setInitializing] = useState(true);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (isSupabaseConfigured && supabase) {
      // Get the initial session directly to determine early if we are authenticated
      supabase.auth.getSession().then(async ({ data: { session } }) => {
        if (session?.user) {
          loadedRef.current = true;
          await loadUserData(session.user.id);
        }
        setInitializing(false);
      }).catch(() => {
        setInitializing(false);
      });

      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_, session) => {
        if (session?.user) {
          if (!loadedRef.current) {
            loadedRef.current = true;
            await loadUserData(session.user.id);
          }
          setInitializing(false);
        }
      });

      return () => subscription.unsubscribe();
    } else {
      const stored = localStorage.getItem("khata_user");
      if (stored) {
        try {
          const user = JSON.parse(stored);
          if (user?.id) {
            loadUserData(user.id);
          }
        } catch {
          console.warn("Failed to parse stored user");
        }
      }
      setInitializing(false);
    }
  }, []);

  useEffect(() => {
    if (initializing || isLoading) {
      const timer = setTimeout(() => {
        setInitializing(false);
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [initializing, isLoading]);

  const showLoading = initializing;
  if (showLoading) {
    return (
      <div className="min-h-screen bg-[#0A0A0B] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#10B981] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={currentUser ? <Navigate to="/dashboard" /> : <LandingView />} />
      <Route path="/login" element={currentUser ? <Navigate to="/dashboard" /> : <LoginView />} />
      <Route path="/dashboard" element={currentUser ? <DashboardView /> : <Navigate to="/login" />} />
      <Route path="/ledger/:ledgerId" element={currentUser ? <LedgerView /> : <Navigate to="/login" />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}
