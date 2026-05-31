import { useState, useEffect } from "react";
import { useKhataStore } from "./store/useKhataStore";
import { supabase, isSupabaseConfigured } from "./lib/supabase";
import LandingView from "./components/LandingView";
import LoginView from "./components/LoginView";
import DashboardView from "./components/DashboardView";
import LedgerView from "./components/LedgerView";

export default function App() {
  const { currentUser, isLoading, loadUserData, logout } = useKhataStore();
  const [view, setView] = useState<"landing" | "login" | "dashboard" | "ledger">("landing");
  const [selectedLedgerId, setSelectedLedgerId] = useState<string>("");
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    if (isSupabaseConfigured && supabase) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          loadUserData(session.user.id);
        }
        setInitializing(false);
      });

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          loadUserData(session.user.id);
        } else {
          logout();
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
  }, [loadUserData, logout]);

  useEffect(() => {
    if (!initializing && !isLoading) {
      if (currentUser) {
        setView("dashboard");
      } else {
        setView("landing");
      }
    }
  }, [currentUser, initializing, isLoading]);

  if (initializing || isLoading) {
    return (
      <div className="min-h-screen bg-[#0A0A0B] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#10B981] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  switch (view) {
    case "landing":
      return <LandingView onStart={() => setView("login")} />;
    case "login":
      return <LoginView onSuccess={() => setView("dashboard")} />;
    case "dashboard":
      return (
        <DashboardView
          onSelectFriendLedger={(ledgerId) => {
            setSelectedLedgerId(ledgerId);
            setView("ledger");
          }}
          onLogout={() => setView("landing")}
        />
      );
    case "ledger":
      return (
        <LedgerView
          ledgerId={selectedLedgerId}
          onSelectLedgerId={(id) => setSelectedLedgerId(id)}
          onBackToDashboard={() => setView("dashboard")}
        />
      );
    default:
      return <LandingView onStart={() => setView("login")} />;
  }
}
