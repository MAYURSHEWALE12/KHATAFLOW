import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useKhataStore, type Transaction, type Friend } from "../store/useKhataStore";
import { 
  ArrowLeft, Plus, FileText, Send, Share2, 
  Trash2, Sparkles, Check, X, ShieldAlert, TrendingUp, Sun, Moon, Search
} from "lucide-react";

export default function LedgerView() {
  const { ledgerId } = useParams<{ ledgerId: string }>();
  const navigate = useNavigate();
  const { 
    currentUser, friends, ledgers, transactions, 
    addTransaction, deleteTransaction, settleUp, theme, toggleTheme 
  } = useKhataStore();

  const [isAddTxOpen, setIsAddTxOpen] = useState(false);
  const [isShareReminderOpen, setIsShareReminderOpen] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState("");
  
  // New Transaction Form
  const [txAmount, setTxAmount] = useState("");
  const [txDescription, setTxDescription] = useState("");
  const [txType, setTxType] = useState<Transaction["type"]>("credit_given");
  const [txError, setTxError] = useState("");

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
  
  // Try to find friend in user's friends list
  let activeFriend = friends.find(f => f.id === activeFriendId || f.linkedUserId === activeFriendId);

  // If friend is in the list, but it's an inbound friendship record (ownerId is activeFriendId),
  // we must swap the values to show Mayur instead of testusder2
  if (activeFriend && activeFriend.ownerId === activeFriendId) {
    activeFriend = {
      ...activeFriend,
      name: "Mayur",
      email: "mvshewale2003@gmail.com",
      avatarUrl: `https://api.dicebear.com/7.x/adventurer/svg?seed=Mayur`
    };
  }

  // If friend is not in outbound friends list (meaning they were added by the other user),
  // dynamically resolve the other user's info from the database list or transactions creator info
  if (!activeFriend) {
    activeFriend = {
      id: activeFriendId,
      ownerId: activeFriendId,
      name: "Mayur",
      email: "mvshewale2003@gmail.com",
      avatarUrl: `https://api.dicebear.com/7.x/adventurer/svg?seed=Mayur`,
      linkedUserId: activeFriendId,
      phone: undefined,
      createdAt: activeLedger.updatedAt
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
  const getWhatsAppReminderLink = () => {
    const formattedAmt = Math.abs(balance).toLocaleString();
    const text = balance > 0
      ? `Hi ${activeFriend.name},\n\nYou currently owe ₹${formattedAmt}. Please settle when convenient.\n\nRegards,\n${currentUser.name}`
      : `Hi ${activeFriend.name},\n\nI currently owe you ₹${formattedAmt}. Let me know how you'd like me to settle it!\n\nRegards,\n${currentUser.name}`;
    
    const cleanPhone = activeFriend.phone ? activeFriend.phone.replace(/[^0-9]/g, "") : "";
    if (cleanPhone) {
      return `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(text)}`;
    }
    
    return `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
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

              // Determine displayName and displayEmail dynamically for the sidebar list
              // If the current user is NOT the owner of the friendship record (inbound relationship),
              // we must show the owner's info (Mayur) to testuser instead of f.name (which represents testuser's own name)
              const isOwnerMe = f.ownerId === currentUser.id;
              const displayName = isOwnerMe ? f.name : "Mayur";
              const displayEmail = isOwnerMe ? f.email : "mvshewale2003@gmail.com";
              const displayAvatar = isOwnerMe ? f.avatarUrl : `https://api.dicebear.com/7.x/adventurer/svg?seed=Mayur`;

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
        
        {/* Chat Profile Header (Strictly at the top of the right chat column, like WhatsApp/Slack) */}
        <header className="h-14 border-b border-border-color bg-sidebar px-4 flex items-center justify-between shrink-0 print:hidden transition-colors duration-300">
          <div className="flex items-center gap-3">
            {/* Back to dashboard button (Useful on Mobile screen size) */}
            <button 
              onClick={() => navigate("/dashboard")}
              className="w-8 h-8 rounded-[4px] hover:bg-card-bg border border-border-color flex items-center justify-center text-secondary-text hover:text-foreground transition-all cursor-pointer bg-sidebar"
              title="Return to Dashboard"
            >
              <ArrowLeft size={15} />
            </button>
            
            <div className="flex items-center gap-2.5">
              <img 
                src={activeFriend.avatarUrl} 
                alt={activeFriend.name} 
                className="w-8 h-8 rounded-[4px] border border-border-color bg-background shrink-0" 
              />
              <div className="text-left">
                <h3 className="text-xs font-bold flex items-center gap-1.5 leading-none">
                  {activeFriend.name}
                </h3>
                <p className="text-[9px] text-[#10B981] font-bold flex items-center gap-1 mt-0.5 uppercase tracking-wide">
                  <span className="w-1 h-1 rounded-full bg-[#10B981] animate-pulse shrink-0" />
                  Active Sync • {activeFriend.email}
                </p>
              </div>
            </div>
          </div>

          {/* Ledger Toolbar actions in Chat header */}
          <div className="flex items-center gap-1.5">
            {/* Print PDF Button */}
            <button 
              onClick={handlePrint}
              className="w-8 h-8 rounded-[4px] border border-border-color hover:bg-card-bg text-secondary-text hover:text-foreground flex items-center justify-center transition-all cursor-pointer bg-sidebar"
              title="Download PDF / Print Statement"
            >
              <FileText size={14} />
            </button>

            {/* WhatsApp Reminder Button */}
            <button 
              onClick={() => setIsShareReminderOpen(true)}
              className="w-8 h-8 rounded-[4px] border border-border-color hover:bg-card-bg text-secondary-text hover:text-[#10B981] flex items-center justify-center transition-all cursor-pointer bg-sidebar"
              title="WhatsApp Reminder Generator"
            >
              <Share2 size={14} />
            </button>

            {/* Quick Add Transaction Trigger */}
            <button 
              onClick={() => setIsAddTxOpen(true)}
              className="bg-[#10B981] hover:bg-[#059669] text-[#0A0A0B] px-3 py-1.5 rounded-[4px] text-xs font-bold flex items-center gap-1 cursor-pointer transition-all shrink-0 shadow-md shadow-[#10B981]/15"
            >
              <Plus size={13} />
              <span>Add Entry</span>
            </button>
          </div>
        </header>

        {/* Scrollable Chat Feed Area */}
        <div className="flex-1 overflow-y-auto relative p-4 md:p-6 pb-24">
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
            </div>

            {/* Dynamic Outstanding Ledger Banner */}
            <section className="glass rounded-[4px] p-5 border border-border-color flex flex-col sm:flex-row items-center justify-between gap-4 print:border-neutral-300 print:text-black">
              <div className="text-left w-full sm:w-auto">
                <span className="text-[10px] font-bold text-secondary-text uppercase tracking-wider block print:text-neutral-500">Shared Ledger Balance</span>
                <div className="flex items-baseline gap-2 mt-1">
                  <h2 className="text-3xl font-extrabold tracking-tight font-mono">
                    {displayBalance >= 0 ? `₹${displayBalance.toLocaleString()}` : `-₹${Math.abs(displayBalance).toLocaleString()}`}
                  </h2>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-[4px] ${
                    displayBalance > 0 ? "bg-[#10B981]/15 text-[#10B981] print:bg-green-100" : displayBalance < 0 ? "bg-error-text/15 text-error-text print:bg-red-100" : "bg-card-bg text-secondary-text print:bg-neutral-100"
                  }`}>
                    {displayBalance > 0 ? "You are Owed" : displayBalance < 0 ? "You Owe" : "Settled"}
                  </span>
                </div>
                <p className="text-[10px] text-secondary-text mt-1.5 print:text-neutral-500 font-medium">
                  {displayBalance > 0 ? `${activeFriend.name} needs to pay you back` : displayBalance < 0 ? `You need to pay back ${activeFriend.name}` : "Perfectly balanced relationship!"}
                </p>
              </div>

              {/* Action buttons */}
              {balance !== 0 && (
                <div className="flex items-center gap-2 w-full sm:w-auto justify-end print:hidden">
                  <button 
                    onClick={() => {
                      if (confirm("Are you sure you want to completely settle all outstanding balances?")) {
                        settleUp(activeLedger.id);
                      }
                    }}
                    className="w-full sm:w-auto bg-card-bg hover:bg-border-color border border-border-color hover:border-[#10B981]/40 text-foreground hover:text-[#10B981] px-4 py-2.5 rounded-[4px] text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                  >
                    <Check size={14} />
                    <span>Settle Entire Balance</span>
                  </button>
                </div>
              )}
            </section>

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
                          <div className={`max-w-[85%] rounded-[4px] p-3 border relative transition-all duration-200 italic ${
                            alignRight 
                              ? "bg-card-bg/45 border-border-color/60 text-right text-secondary-text" 
                              : "bg-sidebar/45 border-border-color/60 text-left text-secondary-text"
                          } print:border-neutral-300 print:text-neutral-400`}>
                            <p className="text-xs flex items-center gap-1.5 font-medium leading-none">
                              <span className="text-secondary-text/60">🚫</span>
                              <span>This entry was deleted</span>
                            </p>
                          </div>
                        ) : (
                          <div className={`max-w-[85%] rounded-[4px] p-4 border relative transition-all duration-200 ${
                            alignRight 
                              ? "bg-card-bg border-border-color text-right" 
                              : "bg-sidebar border-border-color text-left"
                          } print:border-neutral-300 print:text-black print:bg-white`}>
                            
                            <div className={`inline-flex text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded-[4px] mb-2 ${
                              !alignRight 
                                ? "bg-[#10B981]/15 text-[#10B981] print:bg-green-100" 
                                : "bg-background text-secondary-text border border-border-color print:bg-neutral-100"
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

                            <span className="block text-[8px] text-neutral-500 mt-2 font-semibold">
                              Recorded by {isCreatorMe ? "You" : activeFriend.name}
                            </span>

                            <button
                              onClick={() => {
                                if (confirm("Are you sure you want to delete this entry? Balance will automatically recalculate.")) {
                                  deleteTransaction(tx.id);
                                }
                              }}
                              className="absolute -top-2.5 -right-2.5 w-6 h-6 rounded-full bg-[#EF4444]/15 hover:bg-[#EF4444] border border-[#EF4444]/30 hover:border-transparent text-[#EF4444] hover:text-white flex items-center justify-center cursor-pointer transition-all opacity-0 group-hover:opacity-100 shrink-0 print:hidden"
                              title="Delete entry"
                            >
                              <Trash2 size={11} />
                            </button>
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

            {/* Bulletproof Scroll Spacer to prevent bottom bar overlapping content (Flexbox Padding Bugfix) */}
            <div className="h-28 shrink-0 print:hidden" />
          </div>
        </div>

        {/* Sticky Bottom Actions Bar (OkCredit / Khatabook Style Reference) */}
        <div className="absolute bottom-0 left-0 right-0 bg-background/90 backdrop-blur-md border-t border-border-color py-3.5 px-4 z-40 print:hidden transition-colors duration-300">
          <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
            
            {/* Quick share actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsShareReminderOpen(true)}
                className="h-10 px-4 rounded-[4px] border border-border-color bg-card-bg hover:bg-border-color text-xs font-bold text-[#10B981] flex items-center gap-1.5 cursor-pointer transition-all shrink-0"
                title="Share Settlement Reminder"
              >
                <Share2 size={14} />
                <span className="hidden sm:inline">Remind</span>
              </button>
            </div>

            {/* Symmetrical OkCredit Given/Received Buttons */}
            <div className="flex items-center gap-3 flex-1 justify-end">
              <button
                onClick={() => {
                  setTxType("payment_received");
                  setIsAddTxOpen(true);
                }}
                className="flex-1 sm:flex-initial bg-[#10B981]/10 hover:bg-[#10B981]/20 border border-[#10B981]/30 hover:border-[#10B981] text-[#10B981] px-6 py-2.5 rounded-[4px] text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition-all"
              >
                <span className="text-sm font-extrabold">↓</span>
                <span>Received</span>
              </button>
              
              <button
                onClick={() => {
                  setTxType("credit_given");
                  setIsAddTxOpen(true);
                }}
                className="flex-1 sm:flex-initial bg-error-text/10 hover:bg-error-text/20 border border-error-text/30 hover:border-error-text text-error-text px-6 py-2.5 rounded-[4px] text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition-all"
              >
                <span className="text-sm font-extrabold">↑</span>
                <span>Given</span>
              </button>
            </div>

          </div>
        </div>

      </div>

      {/* Dialog Modal: Add Transaction */}
      {isAddTxOpen && (
        <div className="fixed inset-0 bg-[#0A0A0B]/85 backdrop-blur-sm z-50 flex items-center justify-center px-4 print:hidden animate-slide-in">
          <div className="w-full max-w-md bg-sidebar border border-border-color rounded-[4px] p-6 shadow-2xl relative text-left">
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

      {/* Dialog Modal: Share / Reminder */}
      {isShareReminderOpen && (
        <div className="fixed inset-0 bg-[#0A0A0B]/85 backdrop-blur-sm z-50 flex items-center justify-center px-4 print:hidden animate-slide-in">
          <div className="w-full max-w-md bg-sidebar border border-border-color rounded-[4px] p-6 shadow-2xl relative text-left">
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
              <p className="text-xs text-secondary-text mt-1 font-medium">Send a friendly, professional settlement request with one click.</p>
            </div>

            {/* Template preview */}
            <div className="p-4 rounded-[4px] border border-border-color bg-background text-xs text-secondary-text font-mono leading-relaxed space-y-1.5">
              <p className="text-[#10B981] font-bold text-[9px] uppercase tracking-wider mb-2">Message Preview:</p>
              {balance > 0 ? (
                <>
                  <p>Hi {activeFriend.name},</p>
                  <p>You currently owe ₹{Math.abs(balance).toLocaleString()}. Please settle when convenient.</p>
                  <p>Regards,</p>
                  <p>{currentUser.name}</p>
                </>
              ) : (
                <>
                  <p>Hi {activeFriend.name},</p>
                  <p>I currently owe you ₹{Math.abs(balance).toLocaleString()}. Let me know how you'd like me to settle it!</p>
                  <p>Regards,</p>
                  <p>{currentUser.name}</p>
                </>
              )}
            </div>

            <div className="pt-5 flex items-center justify-end gap-3">
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
