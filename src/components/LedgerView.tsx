import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useKhataStore, type Transaction, type Friend } from "../store/useKhataStore";
import { 
  ArrowLeft, Plus, FileText, Send, Share2, Pencil,
  Trash2, Sparkles, Check, X, ShieldAlert, TrendingUp, Sun, Moon, Search
} from "lucide-react";

export default function LedgerView() {
  const { ledgerId } = useParams<{ ledgerId: string }>();
  const navigate = useNavigate();
  const { 
    currentUser, friends, ledgers, transactions, 
    addTransaction, deleteTransaction, editTransaction, updateFriend, settleUp, theme, toggleTheme,
    fetchUserProfile, userProfiles
  } = useKhataStore();

  const [isAddTxOpen, setIsAddTxOpen] = useState(false);
  const [isShareReminderOpen, setIsShareReminderOpen] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState("");
  
  // New Transaction Form
  const [txAmount, setTxAmount] = useState("");
  const [txDescription, setTxDescription] = useState("");
  const [txType, setTxType] = useState<Transaction["type"]>("credit_given");
  const [txError, setTxError] = useState("");

  // Edit Transaction Form
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingTxId, setEditingTxId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editType, setEditType] = useState<Transaction["type"]>("credit_given");
  const [editError, setEditError] = useState("");

  // WhatsApp Custom Message States
  const [customNote, setCustomNote] = useState("");

  // Edit Friend Profile Form
  const [isEditFriendOpen, setIsEditFriendOpen] = useState(false);
  const [editFriendName, setEditFriendName] = useState("");
  const [editFriendPhone, setEditFriendPhone] = useState("");
  const [editFriendError, setEditFriendError] = useState("");

  const handleEditFriendClick = () => {
    if (activeFriend) {
      setEditFriendName(activeFriend.name);
      setEditFriendPhone(activeFriend.phone || "");
      setEditFriendError("");
      setIsEditFriendOpen(true);
    }
  };

  const handleEditFriendSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditFriendError("");

    if (!editFriendName) {
      setEditFriendError("Please enter the friend's name.");
      return;
    }

    if (activeFriend) {
      try {
        await updateFriend(activeFriend.id, editFriendName, editFriendPhone);
        setIsEditFriendOpen(false);
      } catch (err) {
        setEditFriendError(err instanceof Error ? err.message : "Failed to update profile");
      }
    }
  };

  useEffect(() => {
    if (isShareReminderOpen && currentUser && ledgers) {
      const activeLedger = ledgers.find((l) => l.id === ledgerId);
      if (activeLedger) {
        const bal = activeLedger.balance;
        const displayBal = activeLedger.userA === currentUser.id ? bal : -bal;
        setCustomNote(
          displayBal > 0
            ? "Please settle when convenient."
            : "Let me know how you'd like me to settle it!"
        );
      }
    }
  }, [isShareReminderOpen, ledgerId, ledgers, currentUser]);

  const handleEditClick = (tx: Transaction) => {
    setEditingTxId(tx.id);
    setEditAmount(tx.amount.toString());
    setEditDescription(tx.description);
    setEditType(tx.type);
    setEditError("");
    setIsEditOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditError("");

    const parsedAmount = parseFloat(editAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setEditError("Please enter a valid amount greater than zero.");
      return;
    }

    if (!editDescription) {
      setEditError("Please enter a short description.");
      return;
    }

    if (editingTxId) {
      try {
        await editTransaction(editingTxId, editType, parsedAmount, editDescription);
        setIsEditOpen(false);
        setEditingTxId(null);
      } catch (err) {
        setEditError(err instanceof Error ? err.message : "Failed to edit entry");
      }
    }
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = (behavior: ScrollBehavior = "auto") => {
    // Wrap in a tiny timeout to let the DOM settle first
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior, block: "end" });
    }, 50);
  };

  // Scroll to bottom immediately on ledger load
  useEffect(() => {
    scrollToBottom("auto");
  }, [ledgerId]);

  // Scroll smoothly when transactions are added, edited, or deleted
  useEffect(() => {
    scrollToBottom("smooth");
  }, [transactions.length]);

  // Fetch the other user's real profile (must be above ALL early returns — Rules of Hooks)
  useEffect(() => {
    const activeLedger = ledgers.find(l => l.id === ledgerId);
    if (!currentUser || !activeLedger) return;
    const friendId = activeLedger.userA === currentUser.id ? activeLedger.userB : activeLedger.userA;
    if (friendId) fetchUserProfile(friendId);
  }, [ledgerId, ledgers, currentUser]);

  if (!currentUser) return null;

  // Find active ledger
  const activeLedger = ledgers.find(l => l.id === ledgerId);
  if (!activeLedger) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-4">
        <p className="text-sm text-secondary-text mb-4">Ledger not found or invalid URL.</p>
        <button 
          onClick={() => navigate("/dashboard")}
          className="px-4 py-2 border border-border-color rounded-[4px] text-xs hover:bg-card-bg transition-all cursor-pointer bg-sidebar"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }
  
  // Find active friend for timeline
  const activeFriendId = activeLedger.userA === currentUser.id ? activeLedger.userB : activeLedger.userA;

  // Resolve the real name/avatar/email for the other user (from cache or fallback)
  const otherUserProfile = userProfiles[activeFriendId];
  const otherUserName = otherUserProfile?.name ?? "User";
  const otherUserEmail = otherUserProfile?.email ?? "";
  const otherUserAvatar = otherUserProfile?.avatarUrl ?? `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(activeFriendId)}`;
  
  // Try to find friend in user's friends list
  let activeFriend = friends.find(f => f.id === activeFriendId || f.linkedUserId === activeFriendId);

  // If this is an inbound friendship record, swap name/email/avatar from the real user profile
  if (activeFriend && activeFriend.ownerId === activeFriendId) {
    activeFriend = {
      ...activeFriend,
      name: otherUserName,
      email: otherUserEmail,
      avatarUrl: otherUserAvatar,
    };
  }

  // If friend is not found in any outbound list, build a synthetic record from the resolved profile
  if (!activeFriend) {
    activeFriend = {
      id: activeFriendId,
      ownerId: activeFriendId,
      name: otherUserName,
      email: otherUserEmail,
      avatarUrl: otherUserAvatar,
      linkedUserId: activeFriendId,
      phone: undefined,
      createdAt: activeLedger.updatedAt,
    };
  }

  // Get timeline transactions (sorted oldest-to-newest)
  const ledgerTransactions = transactions
    .filter(t => t.ledgerId === activeLedger.id)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const balance = activeLedger.balance;
  const displayBalance = activeLedger.userA === currentUser.id ? balance : -balance;

  // Chronological running balances for premium ledger reporting
  const runningBalances: { [txId: string]: number } = {};
  let runningSum = 0;
  ledgerTransactions.forEach((tx) => {
    const isUserA = tx.createdBy === activeLedger.userA;
    let diff = 0;
    if (tx.isDeleted) {
      diff = 0; // Deleted transactions have no financial impact on the running balance sum
    } else if (tx.type === "credit_given") {
      diff = isUserA ? tx.amount : -tx.amount;
    } else if (tx.type === "payment_received" || tx.type === "settlement") {
      diff = isUserA ? -tx.amount : tx.amount;
    } else if (tx.type === "expense") {
      diff = isUserA ? (tx.amount / 2) : -(tx.amount / 2);
    } else if (tx.type === "adjustment") {
      diff = isUserA ? tx.amount : -tx.amount;
    } else if (tx.type === "refund") {
      diff = isUserA ? -tx.amount : tx.amount;
    }
    runningSum += diff;
    runningBalances[tx.id] = activeLedger.userA === currentUser.id ? runningSum : -runningSum;
  });

  const handleAddTxSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTxError("");

    const parsedAmount = parseFloat(txAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setTxError("Please enter a valid amount greater than zero.");
      return;
    }

    if (!txDescription) {
      setTxError("Please enter a short description.");
      return;
    }

    addTransaction(activeLedger.id, txType, parsedAmount, txDescription);
    
    setTxAmount("");
    setTxDescription("");
    setTxType("credit_given");
    setIsAddTxOpen(false);
  };

  // Generate WhatsApp Reminder Link
  const APP_URL = "https://khataflow.vercel.app";

  const getWhatsAppMessage = () => {
    const formattedAmt = `₹${Math.abs(displayBalance).toLocaleString()}`;
    const friendEmail = activeFriend.email || "";
    const note = customNote.trim();

    if (displayBalance > 0) {
      // They owe us
      return (
        `🙏 *Hi ${activeFriend.name}!*\n\n` +
        `This is a friendly reminder from *${currentUser.name}* regarding our shared KhataFlow ledger.\n\n` +
        `💰 *Amount Due: ${formattedAmt}*\n` +
        `📋 Status: *You owe me*\n\n` +
        (note ? `📝 *Note:* ${note}\n\n` : "") +
        `🔐 *View your live ledger & verify the balance:*\n` +
        `${APP_URL}\n\n` +
        (friendEmail ? `👤 *Login or register with your email:*\n*${friendEmail}*\n\nSign in to see the full transaction history between us in real-time.\n\n` : "") +
        `_Powered by KhataFlow — Track Money. Stay Friends._ 💚`
      );
    } else {
      // We owe them
      return (
        `🙏 *Hi ${activeFriend.name}!*\n\n` +
        `Just a heads-up from *${currentUser.name}* — I'm tracking our balance on KhataFlow.\n\n` +
        `💰 *Amount: ${formattedAmt}*\n` +
        `📋 Status: *I owe you*\n\n` +
        (note ? `📝 *Note:* ${note}\n\n` : "") +
        `🔐 *View our shared ledger:*\n` +
        `${APP_URL}\n\n` +
        (friendEmail ? `👤 *Login or register with your email:*\n*${friendEmail}*\n\nYou can see every transaction recorded between us, anytime.\n\n` : "") +
        `_Powered by KhataFlow — Track Money. Stay Friends._ 💚`
      );
    }
  };

  const getWhatsAppReminderLink = () => {
    const text = getWhatsAppMessage();
    const encoded = encodeURIComponent(text);
    const cleanPhone = activeFriend.phone ? activeFriend.phone.replace(/[^0-9]/g, "") : "";
    if (cleanPhone) {
      // wa.me with phone — works on mobile app & web both
      return `https://wa.me/${cleanPhone}?text=${encoded}`;
    }
    // No phone — opens WhatsApp with pre-filled text, user picks contact
    return `https://wa.me/?text=${encoded}`;
  };

  const handlePrint = () => {
    window.print();
  };

  // Filter Friends inside Sidebar list
  // Mutually show both outbound and inbound friend relationships
  const filteredFriends = friends.filter(
    (f) =>
      (f.ownerId === currentUser.id || f.linkedUserId === currentUser.id) &&
      (f.name.toLowerCase().includes(sidebarSearch.toLowerCase()) ||
      f.email.toLowerCase().includes(sidebarSearch.toLowerCase()))
  );

  const getFriendLedger = (f: Friend) => {
    // Resolve the other participant ID dynamically:
    // If we are the owner of the friendship record f, the friend's ID is f.linkedUserId || f.id.
    // If we are the inbound friend (added by f.ownerId), the other participant's ID is f.ownerId.
    const fId = f.ownerId === currentUser.id ? (f.linkedUserId || f.id) : f.ownerId;
    return ledgers.find(
      (l) =>
        (l.userA === currentUser.id && l.userB === fId) ||
        (l.userA === fId && l.userB === currentUser.id)
    );
  };

  // Sort friends dynamically so that the one with the latest transaction (most recent timestamp) appears first
  const sortedFriends = [...filteredFriends].sort((a, b) => {
    const ledgerA = getFriendLedger(a);
    const ledgerB = getFriendLedger(b);

    let latestTxTimeA = 0;
    if (ledgerA) {
      const txsA = transactions.filter(t => t.ledgerId === ledgerA.id && !t.isDeleted);
      if (txsA.length > 0) {
        latestTxTimeA = Math.max(...txsA.map(t => new Date(t.createdAt).getTime()));
      }
    }

    let latestTxTimeB = 0;
    if (ledgerB) {
      const txsB = transactions.filter(t => t.ledgerId === ledgerB.id && !t.isDeleted);
      if (txsB.length > 0) {
        latestTxTimeB = Math.max(...txsB.map(t => new Date(t.createdAt).getTime()));
      }
    }

    const timeA = latestTxTimeA || (ledgerA ? new Date(ledgerA.updatedAt).getTime() : 0) || new Date(a.createdAt).getTime();
    const timeB = latestTxTimeB || (ledgerB ? new Date(ledgerB.updatedAt).getTime() : 0) || new Date(b.createdAt).getTime();

    return timeB - timeA;
  });

  return (
    <div className="relative h-screen w-screen bg-background text-foreground flex font-sans print:bg-white print:text-black transition-colors duration-300 overflow-hidden">
      
      {/* LEFT COLUMN: Sidebar (Chat App Style Friends List - Full viewport height) */}
      <aside className="hidden md:flex w-80 border-r border-border-color bg-sidebar flex-col shrink-0 h-full transition-colors duration-300">
        
        <div className="h-14 px-4 border-b border-border-color flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-sm tracking-tight">Khata<span className="text-[#10B981]">Flow</span></span>
          </div>
          {/* Visual Theme Toggle inside sidebar */}
          <button
            onClick={toggleTheme}
            className="w-7 h-7 rounded-[4px] border border-border-color hover:bg-card-bg text-secondary-text hover:text-foreground flex items-center justify-center transition-all cursor-pointer bg-sidebar"
            title="Toggle Visual Theme"
          >
            {theme === "dark" ? <Sun size={12} /> : <Moon size={12} />}
          </button>
        </div>

        {/* Sidebar Search Bar */}
        <div className="p-3 border-b border-border-color shrink-0">
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-secondary-text">
              <Search size={13} />
            </span>
            <input
              type="text"
              placeholder="Search ledger..."
              value={sidebarSearch}
              onChange={(e) => setSidebarSearch(e.target.value)}
              className="w-full bg-background border border-border-color rounded-[4px] py-1.5 pl-8 pr-4 text-[11px] text-foreground placeholder-secondary-text/50 focus:outline-none focus:border-[#10B981] transition-all"
            />
          </div>
        </div>

        {/* Sidebar Friends Rows */}
        <div className="flex-grow overflow-y-auto divide-y divide-border-color/40">
          {sortedFriends.length === 0 ? (
            <div className="p-6 text-center text-secondary-text text-xs font-medium">
              No active friendships found.
            </div>
          ) : (
            sortedFriends.map((f) => {
              const friendLedger = getFriendLedger(f);
              const isSelected = friendLedger?.id === ledgerId;
              const rawBal = friendLedger ? friendLedger.balance : 0;
              const friendBal = friendLedger 
                ? (friendLedger.userA === currentUser.id ? rawBal : -rawBal)
                : 0;

              // Resolve display info: if I'm not the owner, show other user's real profile
              const isOwnerMe = f.ownerId === currentUser.id;
              const otherProfile = isOwnerMe ? null : userProfiles[f.ownerId];
              const displayName = isOwnerMe ? f.name : (otherProfile?.name ?? f.name);
              const displayEmail = isOwnerMe ? f.email : (otherProfile?.email ?? f.email);
              const displayAvatar = isOwnerMe ? f.avatarUrl : (otherProfile?.avatarUrl ?? `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(f.ownerId)}`);

              // Fetch the owner's profile if we haven't yet
              if (!isOwnerMe && !userProfiles[f.ownerId]) {
                fetchUserProfile(f.ownerId);
              }

              return (
                <div
                  key={f.id}
                  onClick={() => {
                    if (friendLedger) {
                      navigate("/ledger/" + friendLedger.id);
                    }
                  }}
                  className={`p-3 flex items-center justify-between cursor-pointer transition-all hover:bg-card-bg ${
                    isSelected 
                      ? "bg-card-bg border-l-[3px] border-[#10B981]" 
                      : "border-l-[3px] border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <img 
                      src={displayAvatar} 
                      alt={displayName} 
                      className="w-8 h-8 rounded-[4px] border border-border-color bg-background shrink-0" 
                    />
                    <div className="text-left">
                      <h4 className="text-xs font-bold truncate max-w-[120px]">{displayName}</h4>
                      <p className="text-[9px] text-secondary-text truncate max-w-[120px]">{displayEmail}</p>
                    </div>
                  </div>

                  <div className="text-right">
                    {friendBal > 0 ? (
                      <span className="text-[10px] font-bold text-[#10B981] font-mono block">Owes You ₹{friendBal.toLocaleString()}</span>
                    ) : friendBal < 0 ? (
                      <span className="text-[10px] font-bold text-error-text font-mono block">You Owe ₹{Math.abs(friendBal).toLocaleString()}</span>
                    ) : (
                      <span className="text-[9px] font-semibold text-secondary-text bg-background border border-border-color px-1.5 py-0.5 rounded-[3px] block">Settled</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* RIGHT COLUMN: Chat View (Scrollable timeline feed + top profile bar) */}
      <div className="flex-grow flex flex-col h-full overflow-hidden relative">
        
        {/* Chat Profile Header */}
        <header className="h-14 border-b border-border-color bg-sidebar px-3 flex items-center justify-between shrink-0 print:hidden transition-colors duration-300 gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {/* Back button */}
            <button 
              onClick={() => navigate("/dashboard")}
              className="w-8 h-8 rounded-[4px] hover:bg-card-bg border border-border-color flex items-center justify-center text-secondary-text hover:text-foreground transition-all cursor-pointer bg-sidebar shrink-0"
              title="Return to Dashboard"
            >
              <ArrowLeft size={15} />
            </button>
            
            <div 
              onClick={handleEditFriendClick}
              className="flex items-center gap-2 cursor-pointer hover:opacity-85 transition-all min-w-0 flex-1"
              title="Click to Edit Friend Details"
            >
              <img 
                src={activeFriend.avatarUrl} 
                alt={activeFriend.name} 
                className="w-8 h-8 rounded-full border border-border-color bg-background shrink-0 object-cover" 
              />
              <div className="text-left min-w-0">
                <h3 className="text-xs font-bold leading-none truncate">
                  {activeFriend.name}
                </h3>
                <p className="text-[9px] text-[#10B981] font-bold flex items-center gap-1 mt-0.5 uppercase tracking-wide">
                  <span className="w-1 h-1 rounded-full bg-[#10B981] animate-pulse shrink-0" />
                  <span className="hidden sm:inline">Active Sync •&nbsp;</span>
                  <span className="truncate max-w-[120px] sm:max-w-none">{activeFriend.email}</span>
                </p>
              </div>
            </div>
          </div>

          {/* Toolbar */}
          <div className="flex items-center gap-1 shrink-0">
            <button 
              onClick={handlePrint}
              className="w-8 h-8 rounded-[4px] border border-border-color hover:bg-card-bg text-secondary-text hover:text-foreground flex items-center justify-center transition-all cursor-pointer bg-sidebar"
              title="Download PDF / Print Statement"
            >
              <FileText size={14} />
            </button>

            <button 
              onClick={() => setIsShareReminderOpen(true)}
              className="w-8 h-8 rounded-[4px] border border-border-color hover:bg-card-bg text-secondary-text hover:text-[#10B981] flex items-center justify-center transition-all cursor-pointer bg-sidebar"
              title="WhatsApp Reminder"
            >
              <Share2 size={14} />
            </button>

            <button 
              onClick={() => setIsAddTxOpen(true)}
              className="bg-[#10B981] hover:bg-[#059669] text-[#0A0A0B] px-2.5 py-1.5 rounded-[4px] text-xs font-bold flex items-center gap-1 cursor-pointer transition-all shrink-0 shadow-md shadow-[#10B981]/15"
            >
              <Plus size={13} />
              <span className="hidden xs:inline sm:inline">Add</span>
            </button>
          </div>
        </header>

        {/* Pinned Dynamic Outstanding Ledger Banner */}
        <div className="shrink-0 px-3 md:px-6 py-3 bg-background border-b border-border-color/30 z-10 print:hidden">
          <div className="max-w-3xl w-full mx-auto">
            <section className="glass rounded-[4px] p-4 border border-border-color">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="text-left">
                  <span className="text-[9px] font-bold text-secondary-text uppercase tracking-wider block">Shared Ledger Balance</span>
                  <div className="flex items-baseline gap-2 mt-1 flex-wrap">
                    <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight font-mono">
                      {displayBalance >= 0 ? `₹${displayBalance.toLocaleString()}` : `-₹${Math.abs(displayBalance).toLocaleString()}`}
                    </h2>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-[4px] ${
                      displayBalance > 0 ? "bg-[#10B981]/15 text-[#10B981]" : displayBalance < 0 ? "bg-error-text/15 text-error-text" : "bg-card-bg text-secondary-text"
                    }`}>
                      {displayBalance > 0 ? "You are Owed" : displayBalance < 0 ? "You Owe" : "Settled"}
                    </span>
                  </div>
                  <p className="text-[10px] text-secondary-text mt-1 font-medium">
                    {displayBalance > 0 ? `${activeFriend.name} needs to pay you back` : displayBalance < 0 ? `You need to pay back ${activeFriend.name}` : "Perfectly balanced!"}
                  </p>
                </div>

                {balance !== 0 && (
                  <button 
                    onClick={() => {
                      if (confirm("Are you sure you want to settle all outstanding balances?")) {
                        settleUp(activeLedger.id);
                      }
                    }}
                    className="w-full sm:w-auto bg-[#10B981]/10 hover:bg-[#10B981] border border-[#10B981]/30 hover:border-transparent text-[#10B981] hover:text-[#0A0A0B] px-4 py-2.5 rounded-[4px] text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                  >
                    <Check size={14} />
                    <span>Settle Entire Balance</span>
                  </button>
                )}
              </div>
            </section>
          </div>
        </div>

        {/* Scrollable Chat Feed Area */}
        <div className="flex-1 overflow-y-auto relative p-3 md:p-6 pb-24">
          <div className="max-w-3xl w-full mx-auto flex flex-col gap-6">
            
            {/* Printable Statement header */}
            <div className="hidden print:block mb-8 text-black">
              <div className="flex justify-between items-center border-b pb-4">
                <div>
                  <h1 className="text-2xl font-black">KhataFlow Statement</h1>
                  <p className="text-xs text-neutral-500 font-medium">Track Money. Stay Friends.</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold">Ledger: {currentUser.name} & {activeFriend.name}</p>
                  <p className="text-[10px] text-neutral-500 font-medium">Generated on {new Date().toLocaleDateString()}</p>
                </div>
              </div>

              {/* Print-only Outstanding Ledger Banner */}
              <div className="mt-4 p-4 border border-neutral-300 rounded-[4px] bg-neutral-50">
                <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider block">Shared Ledger Balance</span>
                <div className="flex items-baseline gap-2 mt-1">
                  <h2 className="text-2xl font-black font-mono">
                    {displayBalance >= 0 ? `₹${displayBalance.toLocaleString()}` : `-₹${Math.abs(displayBalance).toLocaleString()}`}
                  </h2>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-[4px] border border-neutral-300 bg-white">
                    {displayBalance > 0 ? "You are Owed" : displayBalance < 0 ? "You Owe" : "Settled"}
                  </span>
                </div>
                <p className="text-[10px] text-neutral-500 mt-1.5 font-medium">
                  {displayBalance > 0 ? `${activeFriend.name} needs to pay you back` : displayBalance < 0 ? `You need to pay back ${activeFriend.name}` : "Perfectly balanced relationship!"}
                </p>
              </div>
            </div>

            {/* WhatsApp Chat-Style Ledger Feed */}
            <section className="flex-1 flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-border-color pb-2 print:border-neutral-300">
                <h4 className="text-xs font-bold text-secondary-text uppercase tracking-wider print:text-neutral-500">Transaction Timeline</h4>
                <span className="text-[10px] text-neutral-500 font-medium">{ledgerTransactions.length} entries</span>
              </div>

              {ledgerTransactions.length === 0 ? (
                <div className="py-20 text-center text-secondary-text flex flex-col items-center justify-center gap-2.5 print:text-neutral-400">
                  <Sparkles size={24} className="text-neutral-700 animate-pulse" />
                  <div>
                    <p className="text-sm font-bold">Ledger Timeline is Empty</p>
                    <p className="text-xs text-neutral-500 mt-1 font-medium">Tap 'Add Entry' to record the first lend, payment, or expense.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {ledgerTransactions.map((tx) => {
                    const isCreatorMe = tx.createdBy === currentUser.id;
                    
                    // Outbound actions from the creator's perspective: anything other than payment_received
                    const isCreatorOutbound = tx.type !== "payment_received";
                    
                    // Align right (outbound) if the logged-in user created an outbound transaction,
                    // or if the other user created an inbound (payment_received) transaction.
                    const alignRight = isCreatorMe ? isCreatorOutbound : !isCreatorOutbound;
                    
                    const runningVal = runningBalances[tx.id] || 0;
                    
                    return (
                      <div 
                        key={tx.id} 
                        className={`flex flex-col ${alignRight ? "items-end" : "items-start"} relative group`}
                      >
                        <span className="text-[8px] text-neutral-500 mb-1 px-1 font-semibold">
                          {new Date(tx.createdAt).toLocaleDateString()} at {new Date(tx.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>

                        {tx.isDeleted ? (
                          <div className={`max-w-[85%] p-3 border relative transition-all duration-200 italic ${
                            alignRight 
                              ? "bg-card-bg/25 border-border-color/40 text-right text-secondary-text rounded-2xl rounded-tr-none" 
                              : "bg-sidebar/25 border-border-color/40 text-left text-secondary-text rounded-2xl rounded-tl-none"
                          } print:border-neutral-300 print:text-neutral-400`}>
                            <p className="text-xs flex items-center gap-1.5 font-medium leading-none">
                              <span className="text-secondary-text/60">🚫</span>
                              <span>This entry was deleted</span>
                            </p>
                          </div>
                        ) : (
                          <div className={`w-full max-w-[92%] sm:max-w-[85%] p-3 sm:p-4 border relative transition-all duration-300 hover:shadow-lg ${
                            alignRight 
                              ? "bg-error-text/[0.03] dark:bg-error-text/[0.05] border-error-text/25 hover:border-error-text/45 text-right rounded-2xl rounded-tr-none shadow-sm" 
                              : "bg-[#10B981]/[0.03] dark:bg-[#10B981]/[0.05] border-[#10B981]/25 hover:border-[#10B981]/45 text-left rounded-2xl rounded-tl-none shadow-sm"
                          } print:border-neutral-300 print:text-black print:bg-white`}>
                            
                            <div className={`inline-flex text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded-[4px] mb-2 ${
                              !alignRight 
                                ? "bg-[#10B981]/15 text-[#10B981] print:bg-green-100" 
                                : "bg-error-text/15 text-error-text print:bg-red-100"
                            }`}>
                              {tx.type.replace("_", " ")}
                            </div>

                            <p className="text-sm font-semibold mb-1 text-foreground print:text-black">
                              {tx.description}
                            </p>

                            <div className={`flex items-baseline gap-1 ${alignRight ? "justify-end" : "justify-start"}`}>
                              <span className={`text-lg font-black font-mono ${
                                !alignRight ? "text-[#10B981]" : "text-error-text"
                              } print:text-black flex items-center gap-0.5`}>
                                <span className="text-sm font-extrabold">{!alignRight ? "+ ↓" : "- ↑"}</span>
                                <span>₹{tx.amount.toLocaleString()}</span>
                              </span>
                            </div>

                            <div className={`flex items-center justify-between gap-4 mt-3 border-t pt-2 print:hidden ${
                              alignRight ? "border-error-text/10" : "border-[#10B981]/10"
                            }`}>
                              <span className="block text-[8px] text-neutral-500 font-semibold">
                                Recorded by {isCreatorMe ? "You" : activeFriend.name}
                              </span>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  onClick={() => handleEditClick(tx)}
                                  className={`w-5.5 h-5.5 rounded-[4px] flex items-center justify-center cursor-pointer transition-all p-1 ${
                                    alignRight
                                      ? "bg-error-text/10 hover:bg-error-text text-error-text hover:text-white border border-error-text/20 hover:border-transparent"
                                      : "bg-[#10B981]/10 hover:bg-[#10B981] text-[#10B981] hover:text-[#0A0A0B] border border-[#10B981]/20 hover:border-transparent"
                                  }`}
                                  title="Edit entry"
                                >
                                  <Pencil size={10} />
                                </button>
                                <button
                                  onClick={() => {
                                    if (confirm("Are you sure you want to delete this entry? Balance will automatically recalculate.")) {
                                      deleteTransaction(tx.id);
                                    }
                                  }}
                                  className="w-5.5 h-5.5 rounded-[4px] bg-error-text/10 hover:bg-[#EF4444] text-error-text hover:text-white border border-error-text/20 hover:border-transparent flex items-center justify-center cursor-pointer transition-all p-1"
                                  title="Delete entry"
                                >
                                  <Trash2 size={10} />
                                </button>
                              </div>
                            </div>

                            {/* Print-only fallback for metadata */}
                            <span className="hidden print:block text-[8px] text-neutral-500 mt-2 font-semibold">
                              Recorded by {isCreatorMe ? "You" : activeFriend.name}
                            </span>
                          </div>
                        )}

                        {/* running balance indicator aligned below the bubble */}
                        <span className={`text-[9px] mt-1.5 px-1 block font-bold text-neutral-500 tracking-tight font-mono ${
                          alignRight ? "text-right" : "text-left"
                        }`}>
                          ₹{Math.abs(runningVal).toLocaleString()} {runningVal > 0 ? "Due" : runningVal < 0 ? "Owe" : "Settled"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Sticky Bottom Actions Bar */}
        <div className="absolute bottom-0 left-0 right-0 bg-background/95 backdrop-blur-md border-t border-border-color py-3 px-3 z-40 print:hidden transition-colors duration-300">
          <div className="max-w-3xl mx-auto flex items-center gap-2">
            
            {/* Share button */}
            <button
              onClick={() => setIsShareReminderOpen(true)}
              className="h-11 w-11 rounded-[4px] border border-border-color bg-card-bg hover:bg-border-color text-xs font-bold text-[#10B981] flex items-center justify-center cursor-pointer transition-all shrink-0"
              title="Share Settlement Reminder"
            >
              <Share2 size={16} />
            </button>

            {/* Received / Given Buttons */}
            <button
              onClick={() => {
                setTxType("payment_received");
                setIsAddTxOpen(true);
              }}
              className="flex-1 h-11 bg-[#10B981]/10 hover:bg-[#10B981]/20 border border-[#10B981]/30 hover:border-[#10B981] text-[#10B981] rounded-[4px] text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition-all"
            >
              <span className="text-sm font-extrabold">↓</span>
              <span>Received</span>
            </button>
            
            <button
              onClick={() => {
                setTxType("credit_given");
                setIsAddTxOpen(true);
              }}
              className="flex-1 h-11 bg-error-text/10 hover:bg-error-text/20 border border-error-text/30 hover:border-error-text text-error-text rounded-[4px] text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition-all"
            >
              <span className="text-sm font-extrabold">↑</span>
              <span>Given</span>
            </button>
          </div>
        </div>

      </div>

      {/* Dialog Modal: Add Transaction */}
      {isAddTxOpen && (
        <div className="fixed inset-0 bg-[#0A0A0B]/85 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center print:hidden animate-slide-in">
          <div className="w-full sm:max-w-md bg-sidebar border border-border-color sm:rounded-[4px] rounded-t-2xl p-5 sm:p-6 shadow-2xl relative text-left max-h-[95vh] overflow-y-auto">
            <button 
              onClick={() => setIsAddTxOpen(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-[4px] hover:bg-card-bg flex items-center justify-center text-secondary-text cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="mb-5">
              <h3 className="text-lg font-bold text-foreground flex items-center gap-1.5">
                <TrendingUp size={18} className="text-[#10B981]" /> Add Ledger Entry
              </h3>
              <p className="text-xs text-secondary-text mt-1 font-medium">Record a new transaction to instantly update the net balance.</p>
            </div>

            {txError && (
              <div className="mb-4 flex items-center gap-2 p-3 rounded-[4px] bg-error-text/10 border border-error-text/20 text-error-text text-xs">
                <ShieldAlert size={16} />
                <span>{txError}</span>
              </div>
            )}

            <form onSubmit={handleAddTxSubmit} className="space-y-4">
              
              {/* Type Selectors */}
              <div>
                <label className="block text-[10px] font-semibold text-secondary-text uppercase tracking-wider mb-2">Entry Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTxType("credit_given")}
                    className={`py-2.5 px-3 rounded-[4px] border text-xs font-bold transition-all cursor-pointer ${
                      txType === "credit_given"
                        ? "bg-[#10B981]/10 border-[#10B981] text-[#10B981]"
                        : "bg-background border-border-color text-secondary-text hover:bg-card-bg"
                    }`}
                  >
                    Gave Credit (Lent)
                  </button>
                  <button
                    type="button"
                    onClick={() => setTxType("payment_received")}
                    className={`py-2.5 px-3 rounded-[4px] border text-xs font-bold transition-all cursor-pointer ${
                      txType === "payment_received"
                        ? "bg-[#10B981]/10 border-[#10B981] text-[#10B981]"
                        : "bg-background border-border-color text-secondary-text hover:bg-card-bg"
                    }`}
                  >
                    Received Repay
                  </button>
                  <button
                    type="button"
                    onClick={() => setTxType("expense")}
                    className={`py-2.5 px-3 rounded-[4px] border text-xs font-bold transition-all cursor-pointer ${
                      txType === "expense"
                        ? "bg-[#10B981]/10 border-[#10B981] text-[#10B981]"
                        : "bg-background border-border-color text-secondary-text hover:bg-card-bg"
                    }`}
                  >
                    Shared Expense
                  </button>
                  <button
                    type="button"
                    onClick={() => setTxType("adjustment")}
                    className={`py-2.5 px-3 rounded-[4px] border text-xs font-bold transition-all cursor-pointer ${
                      txType === "adjustment"
                        ? "bg-[#10B981]/10 border-[#10B981] text-[#10B981]"
                        : "bg-background border-border-color text-secondary-text hover:bg-card-bg"
                    }`}
                  >
                    Adjustment
                  </button>
                </div>
              </div>

              {/* Amount Input */}
              <div>
                <label className="block text-[10px] font-semibold text-secondary-text uppercase tracking-wider mb-2">Amount (₹)</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-secondary-text text-sm">₹</span>
                  <input
                    type="number"
                    step="any"
                    placeholder="0.00"
                    value={txAmount}
                    onChange={(e) => setTxAmount(e.target.value)}
                    className="w-full bg-background border border-border-color rounded-[4px] py-3 pl-8 pr-4 text-xs text-foreground placeholder-secondary-text/45 focus:outline-none focus:border-[#10B981] transition-all"
                    required
                  />
                </div>
              </div>

              {/* Description Input */}
              <div>
                <label className="block text-[10px] font-semibold text-secondary-text uppercase tracking-wider mb-2">Description</label>
                <input
                  type="text"
                  placeholder="e.g. Chai and snacks, Google Pay, Dinner..."
                  value={txDescription}
                  onChange={(e) => setTxDescription(e.target.value)}
                  className="w-full bg-background border border-border-color rounded-[4px] py-3 px-4 text-xs text-foreground placeholder-secondary-text/45 focus:outline-none focus:border-[#10B981] transition-all"
                  required
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddTxOpen(false)}
                  className="px-4 py-2.5 rounded-[4px] border border-border-color hover:bg-card-bg text-xs font-semibold cursor-pointer text-secondary-text transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-[#10B981] hover:bg-[#059669] text-[#0A0A0B] px-4 py-2.5 rounded-[4px] text-xs font-extrabold cursor-pointer transition-all"
                >
                  Record Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Dialog Modal: Edit Transaction */}
      {isEditOpen && (
        <div className="fixed inset-0 bg-[#0A0A0B]/85 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center print:hidden animate-slide-in">
          <div className="w-full sm:max-w-md bg-sidebar border border-border-color sm:rounded-[4px] rounded-t-2xl p-5 sm:p-6 shadow-2xl relative text-left max-h-[95vh] overflow-y-auto">
            <button 
              onClick={() => {
                setIsEditOpen(false);
                setEditingTxId(null);
              }}
              className="absolute top-4 right-4 w-8 h-8 rounded-[4px] hover:bg-card-bg flex items-center justify-center text-secondary-text cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="mb-5">
              <h3 className="text-lg font-bold text-foreground flex items-center gap-1.5">
                <Pencil size={18} className="text-[#10B981]" /> Edit Ledger Entry
              </h3>
              <p className="text-xs text-secondary-text mt-1 font-medium">Modify transaction details and instantly recalculate net ledger balance.</p>
            </div>

            {editError && (
              <div className="mb-4 flex items-center gap-2 p-3 rounded-[4px] bg-error-text/10 border border-error-text/20 text-error-text text-xs">
                <ShieldAlert size={16} />
                <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleEditSubmit} className="space-y-4">
              
              {/* Type Selectors */}
              <div>
                <label className="block text-[10px] font-semibold text-secondary-text uppercase tracking-wider mb-2">Entry Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditType("credit_given")}
                    className={`py-2.5 px-3 rounded-[4px] border text-xs font-bold transition-all cursor-pointer ${
                      editType === "credit_given"
                        ? "bg-[#10B981]/10 border-[#10B981] text-[#10B981]"
                        : "bg-background border-border-color text-secondary-text hover:bg-card-bg"
                    }`}
                  >
                    Gave Credit (Lent)
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditType("payment_received")}
                    className={`py-2.5 px-3 rounded-[4px] border text-xs font-bold transition-all cursor-pointer ${
                      editType === "payment_received"
                        ? "bg-[#10B981]/10 border-[#10B981] text-[#10B981]"
                        : "bg-background border-border-color text-secondary-text hover:bg-card-bg"
                    }`}
                  >
                    Received Repay
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditType("expense")}
                    className={`py-2.5 px-3 rounded-[4px] border text-xs font-bold transition-all cursor-pointer ${
                      editType === "expense"
                        ? "bg-[#10B981]/10 border-[#10B981] text-[#10B981]"
                        : "bg-background border-border-color text-secondary-text hover:bg-card-bg"
                    }`}
                  >
                    Shared Expense
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditType("adjustment")}
                    className={`py-2.5 px-3 rounded-[4px] border text-xs font-bold transition-all cursor-pointer ${
                      editType === "adjustment"
                        ? "bg-[#10B981]/10 border-[#10B981] text-[#10B981]"
                        : "bg-background border-border-color text-secondary-text hover:bg-card-bg"
                    }`}
                  >
                    Adjustment
                  </button>
                </div>
              </div>

              {/* Amount Input */}
              <div>
                <label className="block text-[10px] font-semibold text-secondary-text uppercase tracking-wider mb-2">Amount (₹)</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-secondary-text text-sm">₹</span>
                  <input
                    type="number"
                    step="any"
                    placeholder="0.00"
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    className="w-full bg-background border border-border-color rounded-[4px] py-3 pl-8 pr-4 text-xs text-foreground placeholder-secondary-text/45 focus:outline-none focus:border-[#10B981] transition-all"
                    required
                  />
                </div>
              </div>

              {/* Description Input */}
              <div>
                <label className="block text-[10px] font-semibold text-secondary-text uppercase tracking-wider mb-2">Description</label>
                <input
                  type="text"
                  placeholder="e.g. Chai and snacks, Google Pay, Dinner..."
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full bg-background border border-border-color rounded-[4px] py-3 px-4 text-xs text-foreground placeholder-secondary-text/45 focus:outline-none focus:border-[#10B981] transition-all"
                  required
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditOpen(false);
                    setEditingTxId(null);
                  }}
                  className="px-4 py-2.5 rounded-[4px] border border-border-color hover:bg-card-bg text-xs font-semibold cursor-pointer text-secondary-text transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-[#10B981] hover:bg-[#059669] text-[#0A0A0B] px-4 py-2.5 rounded-[4px] text-xs font-extrabold cursor-pointer transition-all"
                >
                  Save Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Dialog Modal: Edit Friend Profile */}
      {isEditFriendOpen && (
        <div className="fixed inset-0 bg-[#0A0A0B]/85 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center print:hidden animate-slide-in">
          <div className="w-full sm:max-w-md bg-sidebar border border-border-color sm:rounded-[4px] rounded-t-2xl p-5 sm:p-6 shadow-2xl relative text-left max-h-[95vh] overflow-y-auto">
            <button 
              onClick={() => setIsEditFriendOpen(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-[4px] hover:bg-card-bg flex items-center justify-center text-secondary-text cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="mb-5">
              <h3 className="text-lg font-bold text-foreground flex items-center gap-1.5">
                <Pencil size={18} className="text-[#10B981]" /> Edit Friend Details
              </h3>
              <p className="text-xs text-secondary-text mt-1 font-medium">Update {activeFriend.name}'s profile details. These changes sync mutually in real-time.</p>
            </div>

            {editFriendError && (
              <div className="mb-4 flex items-center gap-2 p-3 rounded-[4px] bg-error-text/10 border border-error-text/20 text-error-text text-xs">
                <ShieldAlert size={16} />
                <span>{editFriendError}</span>
              </div>
            )}

            <form onSubmit={handleEditFriendSubmit} className="space-y-4">
              {/* Friend's Name */}
              <div>
                <label className="block text-[10px] font-semibold text-secondary-text uppercase tracking-wider mb-2">Friend's Name</label>
                <input
                  type="text"
                  placeholder="e.g. Rahul Kumar"
                  value={editFriendName}
                  onChange={(e) => setEditFriendName(e.target.value)}
                  className="w-full bg-background border border-border-color rounded-[4px] py-3 px-4 text-xs text-foreground placeholder-secondary-text/45 focus:outline-none focus:border-[#10B981] transition-all"
                  required
                />
              </div>

              {/* Friend's Phone */}
              <div>
                <label className="block text-[10px] font-semibold text-secondary-text uppercase tracking-wider mb-2">Friend's Phone Number (Optional)</label>
                <input
                  type="tel"
                  placeholder="e.g. +919876543210"
                  value={editFriendPhone}
                  onChange={(e) => setEditFriendPhone(e.target.value)}
                  className="w-full bg-background border border-border-color rounded-[4px] py-3 px-4 text-xs text-foreground placeholder-secondary-text/45 focus:outline-none focus:border-[#10B981] transition-all"
                />
                <span className="block text-[9px] text-secondary-text mt-1.5 italic font-medium">
                  💬 Phone number is used to route direct settlement messages to WhatsApp!
                </span>
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsEditFriendOpen(false)}
                  className="px-4 py-2.5 rounded-[4px] border border-border-color hover:bg-card-bg text-xs font-semibold cursor-pointer text-secondary-text transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-[#10B981] hover:bg-[#059669] text-[#0A0A0B] px-4 py-2.5 rounded-[4px] text-xs font-extrabold cursor-pointer transition-all"
                >
                  Save Profile
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Dialog Modal: Share / Reminder */}
      {isShareReminderOpen && (
        <div className="fixed inset-0 bg-[#0A0A0B]/85 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center print:hidden animate-slide-in">
          <div className="w-full sm:max-w-md bg-sidebar border border-border-color sm:rounded-[4px] rounded-t-2xl p-5 sm:p-6 shadow-2xl relative text-left max-h-[95vh] overflow-y-auto">
            <button 
              onClick={() => setIsShareReminderOpen(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-[4px] hover:bg-card-bg flex items-center justify-center text-secondary-text cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="mb-5">
              <h3 className="text-lg font-bold text-foreground flex items-center gap-1.5">
                <Share2 size={18} className="text-[#10B981]" /> WhatsApp Reminder
              </h3>
              <p className="text-xs text-secondary-text mt-1 font-medium">Send a friendly, professional settlement request with secure ledger balances.</p>
            </div>

            {/* Secure Locked Amount Indicator Card */}
            <div className="p-4 rounded-[4px] border border-border-color bg-background mb-4">
              <span className="text-[8px] font-bold text-neutral-500 uppercase tracking-wider block">Verified Ledger Balance</span>
              <h2 className={`text-2xl font-black mt-1 font-mono ${displayBalance > 0 ? "text-[#10B981]" : "text-error-text"}`}>
                ₹{Math.abs(displayBalance).toLocaleString()}
              </h2>
              <p className="text-[9px] text-secondary-text mt-1 font-medium italic">
                🔒 This verified ledger amount is secure and cannot be edited.
              </p>
            </div>

            {/* Editable Custom Message Note Field */}
            <div className="mb-4">
              <label className="block text-[10px] font-semibold text-secondary-text uppercase tracking-wider mb-2">Message Description</label>
              <textarea
                rows={3}
                value={customNote}
                onChange={(e) => setCustomNote(e.target.value)}
                className="w-full bg-background border border-border-color rounded-[4px] py-2.5 px-3 text-xs text-foreground placeholder-secondary-text/45 focus:outline-none focus:border-[#10B981] transition-all resize-none leading-relaxed"
                placeholder="Type custom note..."
                required
              />
            </div>

            {/* Live Message Preview */}
            <div className="p-4 rounded-[4px] border border-[#10B981]/20 bg-[#10B981]/5 mb-4 space-y-1.5">
              <p className="text-[#10B981] font-bold text-[8px] uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse" />
                Live Message Preview
              </p>
              <div className="text-xs text-foreground font-sans leading-relaxed space-y-1.5 bg-[#111214] rounded-[4px] p-3 border border-border-color">
                <p>🙏 <strong>Hi {activeFriend.name}!</strong></p>
                <p className="text-secondary-text">
                  {displayBalance > 0
                    ? <>This is a friendly reminder from <strong>{currentUser.name}</strong> regarding our shared KhataFlow ledger.</>  
                    : <>Just a heads-up from <strong>{currentUser.name}</strong> — I'm tracking our balance on KhataFlow.</>}
                </p>
                <div className="border-t border-border-color/50 pt-1.5 mt-1.5 space-y-0.5">
                  <p>💰 <strong>Amount: ₹{Math.abs(displayBalance).toLocaleString()}</strong></p>
                  <p>📋 Status: <strong className={displayBalance > 0 ? "text-[#10B981]" : "text-error-text"}>{displayBalance > 0 ? "They owe you" : "You owe them"}</strong></p>
                </div>
                {customNote.trim() && (
                  <p className="text-secondary-text">📝 <strong>Note:</strong> {customNote}</p>
                )}
                <div className="border-t border-border-color/50 pt-1.5 mt-1.5 space-y-0.5">
                  <p>🔐 <strong>View live ledger:</strong></p>
                  <p className="text-[#10B981] text-[10px] font-mono">khataflow.vercel.app</p>
                </div>
                {activeFriend.email && (
                  <div className="space-y-0.5">
                    <p>👤 <strong>Login or register with email:</strong></p>
                    <p className="text-[#10B981] font-bold text-[10px] font-mono">{activeFriend.email}</p>
                    <p className="text-secondary-text text-[10px]">
                      {displayBalance > 0
                        ? "Sign in to see the full transaction history between us in real-time."
                        : "You can see every transaction recorded between us, anytime."}
                    </p>
                  </div>
                )}
                <p className="text-secondary-text text-[10px] italic border-t border-border-color/50 pt-1.5 mt-1">Powered by KhataFlow — Track Money. Stay Friends. 💚</p>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsShareReminderOpen(false)}
                className="px-4 py-2.5 rounded-[4px] border border-border-color hover:bg-card-bg text-xs font-semibold cursor-pointer text-secondary-text transition-all"
              >
                Cancel
              </button>
              <a
                href={getWhatsAppReminderLink()}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setIsShareReminderOpen(false)}
                className="bg-[#10B981] hover:bg-[#059669] text-[#0A0A0B] px-4 py-2.5 rounded-[4px] text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition-all hover:no-underline"
              >
                <Send size={14} />
                <span>Send to WhatsApp</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
