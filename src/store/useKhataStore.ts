import { create } from "zustand";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import type { DbUser, DbFriendRelationship, DbLedger, DbTransaction, DbNotification } from "../lib/supabase";

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  provider: string;
}

export interface Friend {
  id: string;
  ownerId: string;
  name: string;
  email: string;
  avatarUrl?: string;
  linkedUserId?: string;
  phone?: string;
  createdAt: string;
}

export interface Ledger {
  id: string;
  userA: string;
  userB: string;
  balance: number;
  updatedAt: string;
}

export interface Transaction {
  id: string;
  ledgerId: string;
  createdBy: string;
  type: "credit_given" | "payment_received" | "expense" | "adjustment" | "settlement" | "refund";
  amount: number;
  description: string;
  createdAt: string;
  isDeleted?: boolean;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

interface KhataState {
  currentUser: User | null;
  friends: Friend[];
  ledgers: Ledger[];
  transactions: Transaction[];
  notifications: Notification[];
  theme: "dark" | "light";
  isLoading: boolean;

  toggleTheme: () => void;

  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string, name: string) => Promise<string | null>;
  googleLogin: () => Promise<void>;
  logout: () => Promise<void>;

  loadUserData: (userId: string) => Promise<void>;
  addFriend: (name: string, email: string, phone?: string) => Promise<Friend>;
  addTransaction: (ledgerId: string, type: Transaction["type"], amount: number, description: string) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
  editTransaction: (id: string, type: Transaction["type"], amount: number, description: string) => Promise<void>;
  updateFriend: (id: string, name: string, phone?: string) => Promise<void>;
  updateProfile: (name: string) => Promise<void>;
  settleUp: (ledgerId: string) => Promise<void>;
  ensureFriendLedger: (friendId: string) => Promise<string | null>;
  markNotificationsRead: () => Promise<void>;
}

const isClient = typeof window !== "undefined";

const loadStored = <T>(key: string, fallback: T): T => {
  if (!isClient) return fallback;
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : fallback;
  } catch {
    return fallback;
  }
};

const persist = (key: string, data: unknown) => {
  if (isClient) {
    localStorage.setItem(key, JSON.stringify(data));
  }
};

function getAvatarUrl(seed: string): string {
  return `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(seed)}`;
}

function toFriend(r: DbFriendRelationship): Friend {
  return {
    id: r.id,
    ownerId: r.owner_id,
    name: r.friend_name,
    email: r.friend_email,
    avatarUrl: getAvatarUrl(r.friend_name),
    linkedUserId: r.linked_user_id ?? undefined,
    phone: r.phone ?? undefined,
    createdAt: r.created_at,
  };
}

function toLedger(r: DbLedger): Ledger {
  return {
    id: r.id,
    userA: r.user_a,
    userB: r.user_b,
    balance: r.balance,
    updatedAt: r.updated_at,
  };
}

function toTransaction(r: DbTransaction): Transaction {
  return {
    id: r.id,
    ledgerId: r.ledger_id,
    createdBy: r.created_by,
    type: r.type,
    amount: r.amount,
    description: r.description,
    createdAt: r.created_at,
    isDeleted: r.is_deleted,
  };
}

function toNotification(r: DbNotification): Notification {
  return {
    id: r.id,
    userId: r.user_id,
    title: r.title,
    message: r.message,
    isRead: r.is_read,
    createdAt: r.created_at,
  };
}

export const useKhataStore = create<KhataState>((set, get) => {
  const initialTheme = loadStored<"dark" | "light">("khata_theme", "dark");
  if (initialTheme === "light" && isClient) {
    document.body.classList.add("light-theme");
  }

  return {
    currentUser: null,
    friends: [],
    ledgers: [],
    transactions: [],
    notifications: [],
    theme: initialTheme,
    isLoading: false,

    toggleTheme: () => {
      const nextTheme = get().theme === "dark" ? "light" : "dark";
      set({ theme: nextTheme });
      persist("khata_theme", nextTheme);
      if (isClient) {
        if (nextTheme === "light") {
          document.body.classList.add("light-theme");
        } else {
          document.body.classList.remove("light-theme");
        }
      }
    },

    signIn: async (email: string, password: string) => {
      if (isSupabaseConfigured && supabase) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) return error.message;
        return null;
      }

      const formattedEmail = email.trim().toLowerCase();
      const registered = loadStored<{ id: string; email: string; name: string }[]>("khata_registered", []);
      const found = registered.find((u) => u.email === formattedEmail);
      if (!found) {
        return "No account found with this email. Please check your spelling or click 'Create Account' to register first!";
      }
      const user: User = {
        id: found.id,
        name: found.name,
        email: found.email,
        avatarUrl: getAvatarUrl(found.name),
        provider: "email",
      };
      set({ currentUser: user });
      persist("khata_user", user);
      return null;
    },

    signUp: async (email: string, password: string, name: string) => {
      if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { name } },
        });
        if (error) return error.message;
        if (data?.user) {
          await supabase.rpc("ensure_user_profile", {
            p_user_id: data.user.id,
            p_name: name.trim(),
            p_email: email.trim().toLowerCase(),
            p_avatar_url: getAvatarUrl(name.trim()),
            p_provider: "email",
          });
        }
        return null;
      }

      const formattedEmail = email.trim().toLowerCase();
      const registered = loadStored<{ id: string; email: string; name: string }[]>("khata_registered", []);
      if (registered.some((u) => u.email === formattedEmail)) {
        return "An account with this email already exists. Please choose Sign In!";
      }
      const newUserId = `user-${Math.random().toString(36).substr(2, 9)}`;
      const newReg = { id: newUserId, email: formattedEmail, name: name.trim() };
      persist("khata_registered", [...registered, newReg]);
      const user: User = {
        id: newUserId,
        name: name.trim(),
        email: formattedEmail,
        avatarUrl: getAvatarUrl(name.trim()),
        provider: "email",
      };
      set({ currentUser: user });
      persist("khata_user", user);
      return null;
    },

    googleLogin: async () => {
      if (isSupabaseConfigured && supabase) {
        await supabase.auth.signInWithOAuth({ provider: "google" });
        return;
      }
      console.warn("Google OAuth is not configured yet.");
    },

    logout: async () => {
      if (isSupabaseConfigured && supabase) {
        try {
          await supabase.auth.signOut();
        } catch (err) {
          console.error("Signout error:", err);
        }
      }
      set({
        currentUser: null,
        friends: [],
        ledgers: [],
        transactions: [],
        notifications: [],
        isLoading: false,
      });
      if (isClient) {
        localStorage.removeItem("khata_user");
        localStorage.removeItem("khata_friends");
        localStorage.removeItem("khata_ledgers");
        localStorage.removeItem("khata_transactions");
        localStorage.removeItem("khata_notifs");
        localStorage.removeItem("khata_registered");
        // Clear Supabase auth session from storage
        const sbKeys = Object.keys(localStorage).filter(k => k.startsWith("sb-"));
        sbKeys.forEach(k => localStorage.removeItem(k));
      }
    },

    loadUserData: async (userId: string) => {
      set({ isLoading: true });

      if (isSupabaseConfigured && supabase) {
        try {
          const [userRes, friendsRes, ledgersRes, txsRes, notifsRes] = await Promise.all([
            supabase.from("users").select("*").eq("id", userId).single<DbUser>(),
            supabase
              .from("friend_relationships")
              .select("*")
              .or(`owner_id.eq.${userId},linked_user_id.eq.${userId}`)
              .order("created_at", { ascending: false }),
            supabase
              .from("ledgers")
              .select("*")
              .or(`user_a.eq.${userId},user_b.eq.${userId}`)
              .order("updated_at", { ascending: false }),
            supabase.rpc("get_user_transactions", { p_user_id: userId }),
            supabase
              .from("notifications")
              .select("*")
              .eq("user_id", userId)
              .order("created_at", { ascending: false }),
          ]);

          let dbUser: DbUser;
          if (userRes.error) {
            const { data: authData } = await supabase.auth.getUser();
            const meta = authData?.user?.user_metadata;
            await supabase.rpc("ensure_user_profile", {
              p_user_id: userId,
              p_name: meta?.name || meta?.full_name || authData?.user?.email?.split("@")[0] || "User",
              p_email: authData?.user?.email || "",
              p_avatar_url: meta?.avatar_url || meta?.avatarUrl || null,
              p_provider: authData?.user?.app_metadata?.provider || "email",
            });
            const retryRes = await supabase.from("users").select("*").eq("id", userId).single<DbUser>();
            if (retryRes.error) throw retryRes.error;
            dbUser = retryRes.data;
          } else {
            dbUser = userRes.data as DbUser;
          }

          const currentUser: User = {
            id: dbUser.id,
            name: dbUser.name,
            email: dbUser.email,
            avatarUrl: dbUser.avatar_url || getAvatarUrl(dbUser.name),
            provider: dbUser.provider,
          };

          const friends: Friend[] = (friendsRes.data || []).map(toFriend);
          const ledgers: Ledger[] = (ledgersRes.data || []).map(toLedger);
          const transactions: Transaction[] = (txsRes.data || []).map(toTransaction);
          const notifications: Notification[] = (notifsRes.data || []).map(toNotification);

          set({ currentUser, friends, ledgers, transactions, notifications, isLoading: false });
          persist("khata_user", currentUser);
          return;
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          console.error("Failed to load user data from Supabase:", message);
          set({ isLoading: false });
          return;
        }
      }

      const storedUser = loadStored<User | null>("khata_user", null);
      const storedFriends = loadStored<Friend[]>("khata_friends", []);
      const storedLedgers = loadStored<Ledger[]>("khata_ledgers", []);
      const storedTxs = loadStored<Transaction[]>("khata_txs", []);
      const storedNotifs = loadStored<Notification[]>("khata_notifs", [
        {
          id: "notif-welcome",
          userId,
          title: "Welcome to KhataFlow!",
          message: "Track money and stay friends. Tap 'Add Friend' to get started.",
          isRead: false,
          createdAt: new Date().toISOString(),
        },
      ]);

      const friends = storedFriends.filter((f) => f.ownerId === userId || f.linkedUserId === userId);
      const ledgers = storedLedgers.filter((l) => l.userA === userId || l.userB === userId);
      const ledgerIds = new Set(ledgers.map((l) => l.id));
      const transactions = storedTxs.filter((t) => ledgerIds.has(t.ledgerId));
      const notifications = storedNotifs.filter((n) => n.userId === userId);

      set({
        currentUser: storedUser,
        friends,
        ledgers,
        transactions,
        notifications,
        isLoading: false,
      });
    },

    addFriend: async (name: string, email: string, phone?: string) => {
      const { currentUser } = get();
      const userId = currentUser?.id;
      if (!userId) throw new Error("No user logged in");

      if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase
          .from("friend_relationships")
          .insert({
            owner_id: userId,
            friend_email: email.trim().toLowerCase(),
            friend_name: name.trim(),
            phone: phone?.trim() || null,
          })
          .select()
          .single<DbFriendRelationship>();

        if (error) throw new Error(error.message);

        const newFriend = toFriend(data);

        set({ friends: [...get().friends, newFriend] });

        const { data: ledgersData } = await supabase
          .from("ledgers")
          .select("*")
          .or(`user_a.eq.${userId},user_b.eq.${userId}`)
          .order("updated_at", { ascending: false }) as { data: DbLedger[] | null };

        if (ledgersData) {
          set({ ledgers: ledgersData.map(toLedger) });
        }

        return newFriend;
      }

      const existingFriends = loadStored<Friend[]>("khata_friends", []);
      const newFriendId = `friend-${Math.random().toString(36).substr(2, 9)}`;
      const newFriend: Friend = {
        id: newFriendId,
        ownerId: userId,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        avatarUrl: getAvatarUrl(name.trim()),
        phone: phone?.trim() || undefined,
        createdAt: new Date().toISOString(),
      };
      const updatedFriends = [...existingFriends, newFriend];
      persist("khata_friends", updatedFriends);
      set({ friends: updatedFriends });

      const ledgerId = `ledger-${name.toLowerCase().replace(/\s+/g, "-")}`;
      const newLedger: Ledger = {
        id: ledgerId,
        userA: userId,
        userB: newFriendId,
        balance: 0,
        updatedAt: new Date().toISOString(),
      };
      const existingLedgers = loadStored<Ledger[]>("khata_ledgers", []);
      const updatedLedgers = [...existingLedgers, newLedger];
      persist("khata_ledgers", updatedLedgers);
      set({ ledgers: updatedLedgers });

      return newFriend;
    },

    updateFriend: async (id: string, name: string, phone?: string) => {
      const { currentUser } = get();
      const userId = currentUser?.id;
      if (!userId) throw new Error("No user logged in");

      if (isSupabaseConfigured && supabase) {
        const { error } = await supabase
          .from("friend_relationships")
          .update({
            friend_name: name.trim(),
            phone: phone?.trim() || null,
          })
          .eq("id", id);

        if (error) throw new Error(error.message);

        // Refresh state
        await get().loadUserData(userId);
        return;
      }

      // Offline implementation
      const existingFriends = loadStored<Friend[]>("khata_friends", []);
      const updatedFriends = existingFriends.map((f) =>
        f.id === id ? { ...f, name: name.trim(), phone: phone?.trim() || undefined } : f
      );
      persist("khata_friends", updatedFriends);

      set({
        friends: get().friends.map((f) =>
          f.id === id ? { ...f, name: name.trim(), phone: phone?.trim() || undefined } : f
        ),
      });
    },

    addTransaction: async (ledgerId: string, type: Transaction["type"], amount: number, description: string) => {
      const { currentUser } = get();
      const userId = currentUser?.id;
      if (!userId) throw new Error("No user logged in");

      if (isSupabaseConfigured && supabase) {
        const { error } = await supabase.from("transactions").insert({
          ledger_id: ledgerId,
          created_by: userId,
          type,
          amount,
          description: description.trim(),
        });
        if (error) throw new Error(error.message);

        const [txsRes, ledgersRes] = await Promise.all([
          supabase
            .from("transactions")
            .select("*")
            .eq("ledger_id", ledgerId)
            .order("created_at", { ascending: false }),
          supabase
            .from("ledgers")
            .select("*")
            .or(`user_a.eq.${userId},user_b.eq.${userId}`)
            .order("updated_at", { ascending: false }),
        ]);

        if (txsRes.data) {
          const allTxs = get().transactions.filter((t) => t.ledgerId !== ledgerId);
          set({ transactions: [...txsRes.data.map(toTransaction), ...allTxs] });
        }
        if (ledgersRes.data) {
          set({ ledgers: ledgersRes.data.map(toLedger) });
        }
        return;
      }

      const existingTxs = loadStored<Transaction[]>("khata_txs", []);
      const newTx: Transaction = {
        id: `tx-${Math.random().toString(36).substr(2, 9)}`,
        ledgerId,
        createdBy: userId,
        type,
        amount,
        description: description.trim(),
        createdAt: new Date().toISOString(),
      };
      const updatedTxs = [newTx, ...existingTxs];
      persist("khata_txs", updatedTxs);
      set({ transactions: updatedTxs });

      const existingLedgers = loadStored<Ledger[]>("khata_ledgers", []);
      const targetLedger = existingLedgers.find((l) => l.id === ledgerId);
      if (targetLedger) {
        const isUserA = userId === targetLedger.userA;
        let diff = 0;
        if (type === "credit_given") diff = isUserA ? amount : -amount;
        else if (type === "payment_received" || type === "settlement") diff = isUserA ? -amount : amount;
        else if (type === "expense") diff = isUserA ? amount / 2 : -(amount / 2);
        else if (type === "adjustment") diff = isUserA ? amount : -amount;
        else if (type === "refund") diff = isUserA ? -amount : amount;

        const updatedLedgers = existingLedgers.map((l) =>
          l.id === ledgerId ? { ...l, balance: l.balance + diff, updatedAt: new Date().toISOString() } : l
        );
        persist("khata_ledgers", updatedLedgers);
        set({ ledgers: updatedLedgers });
      }
    },

    deleteTransaction: async (id: string) => {
      if (isSupabaseConfigured && supabase) {
        const { error } = await supabase.rpc("soft_delete_transaction", { p_transaction_id: id });
        if (error) throw new Error(error.message);

        const tx = get().transactions.find((t) => t.id === id);
        if (tx) {
          set({
            transactions: get().transactions.map((t) =>
              t.id === id ? { ...t, isDeleted: true, description: "This entry was deleted" } : t
            ),
          });

          const userId = get().currentUser?.id;
          if (userId) {
            const { data } = await supabase
              .from("ledgers")
              .select("*")
              .or(`user_a.eq.${userId},user_b.eq.${userId}`)
              .order("updated_at", { ascending: false });
            if (data) set({ ledgers: data.map(toLedger) });
          }
        }
        return;
      }

      const existingTxs = loadStored<Transaction[]>("khata_txs", []);
      const txToDelete = existingTxs.find((t) => t.id === id);
      if (!txToDelete || txToDelete.isDeleted) return;

      const existingLedgers = loadStored<Ledger[]>("khata_ledgers", []);
      const targetLedger = existingLedgers.find((l) => l.id === txToDelete.ledgerId);

      const updatedTxs = existingTxs.map((t) =>
        t.id === id ? { ...t, isDeleted: true, description: "This entry was deleted" } : t
      );
      persist("khata_txs", updatedTxs);
      set({ transactions: updatedTxs });

      if (targetLedger) {
        const isUserA = txToDelete.createdBy === targetLedger.userA;
        let diff = 0;
        if (txToDelete.type === "credit_given") diff = isUserA ? -txToDelete.amount : txToDelete.amount;
        else if (txToDelete.type === "payment_received" || txToDelete.type === "settlement")
          diff = isUserA ? txToDelete.amount : -txToDelete.amount;
        else if (txToDelete.type === "expense") diff = isUserA ? -(txToDelete.amount / 2) : txToDelete.amount / 2;
        else if (txToDelete.type === "adjustment") diff = isUserA ? -txToDelete.amount : txToDelete.amount;
        else if (txToDelete.type === "refund") diff = isUserA ? txToDelete.amount : -txToDelete.amount;

        const updatedLedgers = existingLedgers.map((l) =>
          l.id === targetLedger.id ? { ...l, balance: l.balance + diff, updatedAt: new Date().toISOString() } : l
        );
        persist("khata_ledgers", updatedLedgers);
        set({ ledgers: updatedLedgers });
      }
    },

    editTransaction: async (id: string, type: Transaction["type"], amount: number, description: string) => {
      const tx = get().transactions.find((t) => t.id === id);
      if (!tx || tx.isDeleted) return;

      const { ledgers } = get();
      const targetLedger = ledgers.find((l) => l.id === tx.ledgerId);
      if (!targetLedger) return;

      const isUserA = tx.createdBy === targetLedger.userA;

      // 1. Reverse the old transaction's financial effect
      let reverseDiff = 0;
      if (tx.type === "credit_given") {
        reverseDiff = isUserA ? -tx.amount : tx.amount;
      } else if (tx.type === "payment_received" || tx.type === "settlement") {
        reverseDiff = isUserA ? tx.amount : -tx.amount;
      } else if (tx.type === "expense") {
        reverseDiff = isUserA ? -(tx.amount / 2) : tx.amount / 2;
      } else if (tx.type === "adjustment") {
        reverseDiff = isUserA ? -tx.amount : tx.amount;
      } else if (tx.type === "refund") {
        reverseDiff = isUserA ? tx.amount : -tx.amount;
      }

      // 2. Apply the new transaction's financial effect
      let applyDiff = 0;
      if (type === "credit_given") {
        applyDiff = isUserA ? amount : -amount;
      } else if (type === "payment_received" || type === "settlement") {
        applyDiff = isUserA ? -amount : amount;
      } else if (type === "expense") {
        applyDiff = isUserA ? amount / 2 : -(amount / 2);
      } else if (type === "adjustment") {
        applyDiff = isUserA ? amount : -amount;
      } else if (type === "refund") {
        applyDiff = isUserA ? -amount : amount;
      }

      const balanceDiff = reverseDiff + applyDiff;

      if (isSupabaseConfigured && supabase) {
        // Update transaction in Supabase
        const { error: txError } = await supabase
          .from("transactions")
          .update({
            type,
            amount,
            description: description.trim(),
          })
          .eq("id", id);
        if (txError) throw new Error(txError.message);

        // Update ledger in Supabase
        const { error: ledgerError } = await supabase
          .from("ledgers")
          .update({
            balance: targetLedger.balance + balanceDiff,
            updated_at: new Date().toISOString(),
          })
          .eq("id", targetLedger.id);
        if (ledgerError) throw new Error(ledgerError.message);

        // Refresh state
        const userId = get().currentUser?.id;
        if (userId) {
          await get().loadUserData(userId);
        }
        return;
      }

      // Offline implementation
      const existingTxs = loadStored<Transaction[]>("khata_txs", []);
      const updatedTxs = existingTxs.map((t) =>
        t.id === id ? { ...t, type, amount, description: description.trim() } : t
      );
      persist("khata_txs", updatedTxs);

      const existingLedgers = loadStored<Ledger[]>("khata_ledgers", []);
      const updatedLedgers = existingLedgers.map((l) =>
        l.id === targetLedger.id ? { ...l, balance: l.balance + balanceDiff, updatedAt: new Date().toISOString() } : l
      );
      persist("khata_ledgers", updatedLedgers);

      set({
        transactions: get().transactions.map((t) =>
          t.id === id ? { ...t, type, amount, description: description.trim() } : t
        ),
        ledgers: get().ledgers.map((l) =>
          l.id === targetLedger.id ? { ...l, balance: l.balance + balanceDiff, updatedAt: new Date().toISOString() } : l
        ),
      });
    },

    ensureFriendLedger: async (friendId: string): Promise<string | null> => {
      if (!(isSupabaseConfigured && supabase)) return null;
      try {
        const { data: ledgerId, error } = await supabase.rpc("ensure_friend_ledger", {
          p_friend_rel_id: friendId,
        });
        if (error) throw error;
        if (ledgerId) {
          const { data: fr } = await supabase
            .from("friend_relationships")
            .select("linked_user_id")
            .eq("id", friendId)
            .single<{ linked_user_id: string | null }>();
          if (fr?.linked_user_id) {
            const linkedUserId: string | undefined = fr.linked_user_id ?? undefined;
            set({
              friends: get().friends.map((f) =>
                f.id === friendId ? { ...f, linkedUserId } : f
              ),
            });
          }
          const { data: ledgersData } = await supabase
            .from("ledgers").select("*")
            .or(`user_a.eq.${get().currentUser?.id},user_b.eq.${get().currentUser?.id}`)
            .order("updated_at", { ascending: false }) as { data: DbLedger[] | null };
          if (ledgersData) set({ ledgers: ledgersData.map(toLedger) });
        }
        return ledgerId as string | null;
      } catch {
        return null;
      }
    },

    settleUp: async (ledgerId: string) => {
      const { ledgers } = get();
      const targetLedger = ledgers.find((l) => l.id === ledgerId);
      if (!targetLedger || targetLedger.balance === 0) return;

      const amount = Math.abs(targetLedger.balance);
      const type = targetLedger.balance > 0 ? "payment_received" : "settlement";
      await get().addTransaction(ledgerId, type, amount, "Settled entire outstanding balance");
    },

    updateProfile: async (name: string) => {
      const { currentUser } = get();
      const userId = currentUser?.id;
      if (!userId) throw new Error("No user logged in");

      const trimmedName = name.trim();
      const newAvatarUrl = getAvatarUrl(trimmedName);

      if (isSupabaseConfigured && supabase) {
        const { error } = await supabase
          .from("users")
          .update({
            name: trimmedName,
            avatar_url: newAvatarUrl,
          })
          .eq("id", userId);

        if (error) throw new Error(error.message);

        // Refresh state
        await get().loadUserData(userId);
        return;
      }

      // Offline implementation
      const storedUser = loadStored<User | null>("khata_user", null);
      if (storedUser) {
        const updatedUser = { ...storedUser, name: trimmedName, avatarUrl: newAvatarUrl };
        persist("khata_user", updatedUser);
        set({ currentUser: updatedUser });
      }
    },

    markNotificationsRead: async () => {
      if (isSupabaseConfigured && supabase) {
        const userId = get().currentUser?.id;
        if (!userId) return;
        const { error } = await supabase
          .from("notifications")
          .update({ is_read: true })
          .eq("user_id", userId)
          .eq("is_read", false);
        if (!error) {
          set({ notifications: get().notifications.map((n) => ({ ...n, isRead: true })) });
        }
        return;
      }

      const updatedNotifs = get().notifications.map((n) => ({ ...n, isRead: true }));
      persist("khata_notifs", updatedNotifs);
      set({ notifications: updatedNotifs });
    },
  };
});
