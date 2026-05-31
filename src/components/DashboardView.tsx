import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useKhataStore, type Friend, type Ledger } from "../store/useKhataStore";
import { 
  Plus, Search, LogOut, Bell, 
  ArrowUpRight, ArrowDownLeft, Users, ShieldAlert, Sparkles, X, ChevronRight, UserPlus, Sun, Moon
} from "lucide-react";

export default function DashboardView() {
  const navigate = useNavigate();
  const { 
    currentUser, friends, ledgers, notifications, 
    logout, addFriend, markNotificationsRead, theme, toggleTheme
  } = useKhataStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  
  // Friend Form States
  const [friendName, setFriendName] = useState("");
  const [friendEmail, setFriendEmail] = useState("");
  const [friendPhone, setFriendPhone] = useState("");
  const [formError, setFormError] = useState("");

  if (!currentUser) return null;

  // Calculate Net Balances
  let totalLent = 0;
  let totalBorrowed = 0;
  
  ledgers.forEach((l) => {
    // Only calculate for ledgers where the current user is a participant
    if (l.userA === currentUser.id || l.userB === currentUser.id) {
      // Balance is relative to userA (positive means userA is owed, negative means userA owes)
      const userBalance = l.userA === currentUser.id ? l.balance : -l.balance;
      
      if (userBalance > 0) {
        totalLent += userBalance;
      } else if (userBalance < 0) {
        totalBorrowed += Math.abs(userBalance);
      }
    }
  });

  const netBalance = totalLent - totalBorrowed;

  // Filter Friends
  // Mutually show both friends added by this user, and friends added by others that link to this user
  const filteredFriends = friends.filter(
    (friend) =>
      (friend.ownerId === currentUser.id || friend.linkedUserId === currentUser.id) &&
      (friend.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      friend.email.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Helper
  const getFriendLedger = (friend: Friend): Ledger | undefined => {
    const friendId = friend.linkedUserId || friend.id;
    return ledgers.find(
      (l) =>
        (l.userA === currentUser.id && l.userB === friendId) ||
        (l.userA === friendId && l.userB === currentUser.id)
    );
  };

  const handleFriendClick = async (friend: Friend) => {
    const ledger = getFriendLedger(friend);
    if (ledger) {
      navigate("/ledger/" + ledger.id);
      return;
    }
    try {
      const newLedgerId = await useKhataStore.getState().ensureFriendLedger(friend.id);
      if (newLedgerId) {
        navigate("/ledger/" + newLedgerId);
      }
    } catch {}
  };

  const handleAddFriendSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!friendName || !friendEmail) {
      setFormError("Name and Email fields are required.");
      return;
    }

    const exists = friends.some(
      (f) => f.email.toLowerCase() === friendEmail.toLowerCase()
    );
    if (exists) {
      setFormError("A friend with this email already exists.");
      return;
    }

    const newFriend = await addFriend(friendName, friendEmail, friendPhone);
    
    setFriendName("");
    setFriendEmail("");
    setFriendPhone("");
    setIsAddModalOpen(false);

    handleFriendClick(newFriend);
  };

  const userNotifications = notifications.filter(n => n.userId === currentUser.id);
  const unreadNotifs = userNotifications.filter(n => !n.isRead).length;

  return (
    <div className="relative min-h-screen bg-[#0A0A0B] text-[#F5F5F5] flex flex-col font-sans">
      {/* Background glow effects */}
      <div className="absolute top-0 right-0 w-[400px] h-[400px] rounded-full bg-[#10B981]/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[350px] h-[350px] rounded-full bg-[#EF4444]/2 blur-[130px] pointer-events-none" />

      {/* Top Navigation Bar */}
      <header className="border-b border-[#26272B] bg-[#111214]/80 backdrop-blur-md sticky top-0 z-30 px-4 md:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <span className="font-extrabold text-lg tracking-tight leading-none block">Khata<span className="text-[#10B981]">Flow</span></span>
            <p className="text-[10px] text-[#A1A1AA] hidden sm:block font-medium mt-0.5">Track Money. Stay Friends.</p>
          </div>
        </div>

        {/* User Actions */}
        <div className="flex items-center gap-3">
          {/* Visual Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="w-10 h-10 rounded-[4px] border border-[#26272B] bg-[#151618]/60 hover:bg-[#26272B] flex items-center justify-center cursor-pointer transition-all text-[#A1A1AA] hover:text-[#F5F5F5]"
            title="Toggle Visual Theme"
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          {/* Notifications Trigger */}
          <button 
            onClick={() => {
              setIsNotifOpen(!isNotifOpen);
              if (unreadNotifs > 0) markNotificationsRead();
            }}
            className="w-10 h-10 rounded-[4px] border border-[#26272B] bg-[#151618]/60 hover:bg-[#26272B] flex items-center justify-center relative cursor-pointer transition-all"
          >
            <Bell size={18} className="text-[#A1A1AA]" />
            {unreadNotifs > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#10B981] text-[#0A0A0B] font-black text-[10px] flex items-center justify-center animate-bounce">
                {unreadNotifs}
              </span>
            )}
          </button>

          {/* User Profile Info */}
          <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-[4px] border border-[#26272B] bg-[#151618]/30">
            <img 
              src={currentUser.avatarUrl} 
              alt={currentUser.name} 
              className="w-7 h-7 rounded-[4px] border border-[#26272B] bg-[#0A0A0B]" 
            />
            <div className="hidden sm:block text-left">
              <p className="text-xs font-semibold">{currentUser.name}</p>
              <p className="text-[9px] text-[#A1A1AA] max-w-[100px] truncate">{currentUser.email}</p>
            </div>
          </div>

          {/* Logout Button */}
          <button 
            onClick={async () => {
              await logout();
              navigate("/");
            }}
            className="w-10 h-10 rounded-[4px] border border-[#26272B] hover:border-[#EF4444]/30 hover:bg-[#EF4444]/10 hover:text-[#EF4444] text-[#A1A1AA] flex items-center justify-center cursor-pointer transition-all"
            title="Log Out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 md:px-8 py-8 space-y-8 z-10">
        
        {/* KPI Dashboard Card Grid */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {/* Outstanding Balance */}
          <div className="glass rounded-[4px] p-6 relative overflow-hidden transition-all duration-300 hover:scale-[1.02]">
            <div className="flex items-center justify-between mb-3.5">
              <span className="text-xs font-bold text-[#A1A1AA] uppercase tracking-wider">Net Outstanding Balance</span>
              <div className={`w-8 h-8 rounded-[4px] flex items-center justify-center ${
                netBalance > 0 ? "bg-[#10B981]/10 text-[#10B981]" : netBalance < 0 ? "bg-[#EF4444]/10 text-[#EF4444]" : "bg-neutral-800 text-neutral-400"
              }`}>
                {netBalance > 0 ? <ArrowUpRight size={18} /> : <ArrowDownLeft size={18} />}
              </div>
            </div>
            <h2 className="text-3xl font-extrabold tracking-tight font-mono">
              {netBalance >= 0 ? `₹${netBalance.toLocaleString()}` : `-₹${Math.abs(netBalance).toLocaleString()}`}
            </h2>
            <p className="text-[10px] text-[#A1A1AA] mt-2 font-medium">
              {netBalance > 0 ? "Overall you are owed" : netBalance < 0 ? "Overall you owe friends" : "All settled up!"}
            </p>
          </div>

          {/* Total Lent */}
          <div className="glass rounded-[4px] p-6 relative overflow-hidden transition-all duration-300 hover:scale-[1.02]">
            <div className="flex items-center justify-between mb-3.5">
              <span className="text-xs font-bold text-[#A1A1AA] uppercase tracking-wider">Total You Lent</span>
              <div className="w-8 h-8 rounded-[4px] bg-[#10B981]/10 text-[#10B981] flex items-center justify-center">
                <ArrowUpRight size={18} />
              </div>
            </div>
            <h2 className="text-3xl font-extrabold tracking-tight text-[#10B981] font-mono">
              ₹{totalLent.toLocaleString()}
            </h2>
            <p className="text-[10px] text-[#A1A1AA] mt-2 font-medium">Collect from friends who owe you</p>
          </div>

          {/* Total Borrowed */}
          <div className="glass rounded-[4px] p-6 relative overflow-hidden transition-all duration-300 hover:scale-[1.02]">
            <div className="flex items-center justify-between mb-3.5">
              <span className="text-xs font-bold text-[#A1A1AA] uppercase tracking-wider">Total You Borrowed</span>
              <div className="w-8 h-8 rounded-[4px] bg-[#EF4444]/10 text-[#EF4444] flex items-center justify-center">
                <ArrowDownLeft size={18} />
              </div>
            </div>
            <h2 className="text-3xl font-extrabold tracking-tight text-[#EF4444] font-mono">
              ₹{totalBorrowed.toLocaleString()}
            </h2>
            <p className="text-[10px] text-[#A1A1AA] mt-2 font-medium">Repay to clear your dues</p>
          </div>
        </section>

        {/* Friends & Ledger Section */}
        <section className="glass rounded-[4px] p-6 border border-[#26272B]">
          
          {/* Header Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h3 className="text-lg font-bold">Shared Ledgers</h3>
              <p className="text-xs text-[#A1A1AA] font-medium">Maintaining active financial relationships</p>
            </div>
            
            <div className="flex items-center gap-3">
              {/* Search Field */}
              <div className="relative flex-1 sm:w-64">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-[#A1A1AA]">
                  <Search size={15} />
                </span>
                <input
                  type="text"
                  placeholder="Search friends..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[#0A0A0B] border border-[#26272B] rounded-[4px] py-2 pl-9 pr-4 text-xs text-[#F5F5F5] placeholder-[#A1A1AA]/50 focus:outline-none focus:border-[#10B981] transition-all"
                />
              </div>

              {/* Add Friend Trigger */}
              <button 
                onClick={() => setIsAddModalOpen(true)}
                className="bg-[#10B981] hover:bg-[#059669] text-[#0A0A0B] px-3.5 py-2 rounded-[4px] text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition-all shrink-0 animate-pulse shadow-md shadow-[#10B981]/15"
              >
                <Plus size={16} />
                <span className="hidden sm:inline">Add Friend</span>
              </button>
            </div>
          </div>

          {/* Friends List */}
          {filteredFriends.length === 0 ? (
            <div className="py-16 text-center text-[#A1A1AA] border-2 border-dashed border-[#26272B] rounded-[4px] flex flex-col items-center justify-center gap-3">
              <Users size={32} className="text-neutral-700" />
              <div>
                <p className="text-sm font-bold">No friends matched your search.</p>
                <p className="text-xs text-neutral-500 mt-1 font-medium">Add a new relationship to start tracking shared balances.</p>
              </div>
              <button 
                onClick={() => setIsAddModalOpen(true)}
                className="mt-2 text-xs font-bold text-[#10B981] flex items-center gap-1 hover:underline cursor-pointer"
              >
                <UserPlus size={14} /> Add new friend now
              </button>
            </div>
          ) : (
            <div className="divide-y divide-[#26272B]">
              {filteredFriends.map((friend) => {
                const ledger = getFriendLedger(friend);
                const rawBalance = ledger ? ledger.balance : 0;
                const balance = ledger 
                  ? (ledger.userA === currentUser.id ? rawBalance : -rawBalance)
                  : 0;
                
                return (
                  <div 
                    key={friend.id}
                    onClick={() => handleFriendClick(friend)}
                    className="py-4 flex items-center justify-between hover:bg-[#151618]/30 px-3 -mx-3 rounded-[4px] cursor-pointer transition-all group"
                  >
                    {/* Friend Detail */}
                    <div className="flex items-center gap-3.5">
                      <div className="relative">
                        <img 
                          src={friend.avatarUrl} 
                          alt={friend.name} 
                          className="w-11 h-11 rounded-[4px] border border-[#26272B] bg-[#111214]" 
                        />
                        {friend.linkedUserId ? (
                          <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-[#10B981] border border-[#0A0A0B] flex items-center justify-center text-[8px] text-[#0A0A0B] font-bold" title="Linked live account">
                            ✓
                          </span>
                        ) : (
                          <span className="absolute -bottom-1 -right-1 px-1 rounded-full bg-[#A1A1AA]/10 border border-[#26272B] text-[7px] text-[#A1A1AA]" title="Offline ledger, will auto-link when they join">
                            offline
                          </span>
                        )}
                      </div>
                      <div className="text-left">
                        <h4 className="text-sm font-bold group-hover:text-[#10B981] transition-colors">{friend.name}</h4>
                        <p className="text-[10px] text-[#A1A1AA] mt-0.5 font-medium">{friend.email}</p>
                      </div>
                    </div>

                    {/* Balance Status */}
                    <div className="text-right flex items-center gap-4">
                      <div>
                        {balance > 0 ? (
                          <>
                            <span className="text-[10px] font-bold text-[#10B981] uppercase tracking-wider block">Owes You</span>
                            <span className="text-sm font-extrabold text-[#10B981] font-mono">₹{balance.toLocaleString()}</span>
                          </>
                        ) : balance < 0 ? (
                          <>
                            <span className="text-[10px] font-bold text-[#EF4444] uppercase tracking-wider block">You Owe</span>
                            <span className="text-sm font-extrabold text-[#EF4444] font-mono">₹{Math.abs(balance).toLocaleString()}</span>
                          </>
                        ) : (
                          <span className="text-xs text-[#A1A1AA] font-semibold bg-neutral-900 border border-neutral-800 px-2 py-0.5 rounded-[4px]">Settled Up</span>
                        )}
                        <span className="block text-[8px] text-neutral-500 mt-1">
                          Last active {ledger ? new Date(ledger.updatedAt).toLocaleDateString() : "Just now"}
                        </span>
                      </div>
                      <ChevronRight size={16} className="text-neutral-600 group-hover:translate-x-1 group-hover:text-white transition-all" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* Slide-out Panel: Notifications */}
      {isNotifOpen && (
        <div className="fixed inset-0 bg-[#0A0A0B]/80 backdrop-blur-sm z-50 flex justify-end">
          <div className="w-full max-w-sm bg-[#111214] border-l border-[#26272B] h-full flex flex-col p-6 shadow-2xl relative">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-extrabold text-lg flex items-center gap-2">
                <Bell size={18} className="text-[#10B981]" /> Activity Stream
              </h3>
              <button 
                onClick={() => setIsNotifOpen(false)}
                className="w-8 h-8 rounded-[4px] hover:bg-[#26272B] flex items-center justify-center text-[#A1A1AA] cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3.5 pr-1">
              {userNotifications.map((n) => (
                <div key={n.id} className="p-3.5 rounded-[4px] border border-[#26272B] bg-[#151618]/50 text-left">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-[#10B981] font-bold">Activity</span>
                    <span className="text-[8px] text-neutral-500">{new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <h4 className="text-xs font-bold mt-1 text-[#F5F5F5]">{n.title}</h4>
                  <p className="text-[11px] text-[#A1A1AA] mt-0.5 font-medium">{n.message}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Dialog Modal: Add Friend */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-[#0A0A0B]/80 backdrop-blur-sm z-50 flex items-center justify-center px-4">
          <div className="w-full max-w-md bg-[#111214] border border-[#26272B] rounded-[4px] p-6 shadow-2xl relative text-left animate-slide-in">
            <button 
              onClick={() => setIsAddModalOpen(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-[4px] hover:bg-[#26272B] flex items-center justify-center text-[#A1A1AA] cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="mb-5">
              <h3 className="text-lg font-bold text-[#F5F5F5] flex items-center gap-1.5">
                <UserPlus size={18} className="text-[#10B981]" /> Add Friend
              </h3>
              <p className="text-xs text-[#A1A1AA] mt-1 font-medium">Start a shared financial ledger instantly without wait or requests.</p>
            </div>

            {formError && (
              <div className="mb-4 flex items-center gap-2 p-3 rounded-[4px] bg-[#EF4444]/10 border border-[#EF4444]/20 text-[#EF4444] text-xs">
                <ShieldAlert size={16} />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleAddFriendSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-semibold text-[#A1A1AA] uppercase tracking-wider mb-2">Friend's Name</label>
                <input
                  type="text"
                  placeholder="e.g. Rahul Kumar"
                  value={friendName}
                  onChange={(e) => setFriendName(e.target.value)}
                  className="w-full bg-[#0A0A0B] border border-[#26272B] rounded-[4px] py-3 px-4 text-xs text-[#F5F5F5] placeholder-[#A1A1AA]/45 focus:outline-none focus:border-[#10B981] transition-all"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-[#A1A1AA] uppercase tracking-wider mb-2">Friend's Email Address</label>
                <input
                  type="email"
                  placeholder="rahul@example.com"
                  value={friendEmail}
                  onChange={(e) => setFriendEmail(e.target.value)}
                  className="w-full bg-[#0A0A0B] border border-[#26272B] rounded-[4px] py-3 px-4 text-xs text-[#F5F5F5] placeholder-[#A1A1AA]/45 focus:outline-none focus:border-[#10B981] transition-all"
                  required
                />
                <span className="block text-[9px] text-[#A1A1AA]/70 mt-1.5 italic font-medium">
                  💡 Auto-linking: If this email matches a future or registered user, they gain secure real-time sync automatically!
                </span>
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-[#A1A1AA] uppercase tracking-wider mb-2">Friend's Phone Number (Optional)</label>
                <input
                  type="tel"
                  placeholder="e.g. +919876543210"
                  value={friendPhone}
                  onChange={(e) => setFriendPhone(e.target.value)}
                  className="w-full bg-[#0A0A0B] border border-[#26272B] rounded-[4px] py-3 px-4 text-xs text-[#F5F5F5] placeholder-[#A1A1AA]/45 focus:outline-none focus:border-[#10B981] transition-all"
                />
                <span className="block text-[9px] text-[#A1A1AA]/70 mt-1.5 italic font-medium">
                  💬 Direct Reminders: Enter their number with country code (e.g. 91...) to open their specific WhatsApp chat on reminder send!
                </span>
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2.5 rounded-[4px] border border-[#26272B] hover:bg-[#151618] text-xs font-semibold cursor-pointer text-[#A1A1AA] transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-[#10B981] hover:bg-[#059669] text-[#0A0A0B] px-4 py-2.5 rounded-[4px] text-xs font-extrabold cursor-pointer transition-all"
                >
                  Add & Open Ledger
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sticky Bottom Ribbon */}
      <footer className="mt-auto border-t border-[#26272B] bg-[#111214]/40 py-4 text-center text-[10px] text-neutral-500 flex items-center justify-center gap-2">
        <Sparkles size={11} className="text-[#10B981]" />
        <span className="font-semibold">One Relationship = One Shared Ledger | Active Session</span>
      </footer>
    </div>
  );
}
