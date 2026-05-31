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
    // 1. Sync local storage fast-hydration fallback immediately to prevent routing redirect race
    const stored = localStorage.getItem("khata_user");
    if (stored) {
      try {
        const user = JSON.parse(stored);
        if (user?.id) {
          useKhataStore.setState({ currentUser: user });
          loadedRef.current = true;
          loadUserData(user.id);
        }
      } catch {
        console.warn("Failed to parse stored user");
      }
    }

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

      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (session?.user) {
          if (!loadedRef.current) {
            loadedRef.current = true;
            await loadUserData(session.user.id);
          }
          setInitializing(false);
        } else if (event === "SIGNED_OUT") {
          // Explicit signout triggered by user action
          loadedRef.current = false;
          useKhataStore.setState({
            currentUser: null,
            friends: [],
            ledgers: [],
            transactions: [],
            notifications: []
          });
          setInitializing(false);
        }
      });

      return () => subscription.unsubscribe();
    } else {
      setInitializing(false);
    }
  }, []);

  // Subscribe to real-time database updates for instant chat and ledger syncing
  useEffect(() => {
    const sb = supabase;
    if (!currentUser || !isSupabaseConfigured || !sb) return;

    const channel = sb
      .channel("schema-db-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "transactions" },
        () => {
          loadUserData(currentUser.id);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ledgers" },
        () => {
          loadUserData(currentUser.id);
        }
      )
      .subscribe();

    return () => {
      sb.removeChannel(channel);
    };
  }, [currentUser]);

  // Bulletproof 3-second polling fallback to ensure syncing even if Supabase Realtime replication is disabled
  useEffect(() => {
    if (!currentUser) return;

    const interval = setInterval(() => {
      loadUserData(currentUser.id);
    }, 3000);

    return () => clearInterval(interval);
  }, [currentUser]);

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
