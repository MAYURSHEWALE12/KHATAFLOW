import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

if (!isSupabaseConfigured) {
  console.info(
    "KhataFlow running in local-only mode. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env to enable Supabase."
  );
}

export type DbUser = {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  provider: string;
  created_at: string;
  updated_at: string;
};

export type DbFriendRelationship = {
  id: string;
  owner_id: string;
  friend_email: string;
  friend_name: string;
  phone: string | null;
  linked_user_id: string | null;
  created_at: string;
};

export type DbLedger = {
  id: string;
  user_a: string;
  user_b: string;
  balance: number;
  created_at: string;
  updated_at: string;
};

export type DbTransaction = {
  id: string;
  ledger_id: string;
  created_by: string;
  type: "credit_given" | "payment_received" | "expense" | "adjustment" | "settlement" | "refund";
  amount: number;
  description: string;
  attachment_url: string | null;
  is_deleted: boolean;
  created_at: string;
};

export type DbNotification = {
  id: string;
  user_id: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
};
