import { 
  Sparkles, Share2, FileText, ArrowRight, ShieldCheck, Zap, HeartHandshake, ChevronRight, Sun, Moon
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useKhataStore } from "../store/useKhataStore";

export default function LandingView() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useKhataStore();

  return (
    <div className="relative min-h-screen bg-background text-foreground font-sans overflow-y-auto transition-colors duration-300">
      
      {/* High-Density Terminal Ticker Ribbon (Matches Reference Image) */}
      <div className="w-full bg-sidebar border-b border-border-color py-2 px-4 text-[10px] font-mono text-secondary-text overflow-hidden whitespace-nowrap select-none sticky top-0 z-50 flex items-center gap-6 transition-colors duration-300">
        <span className="text-[#10B981] font-bold flex items-center gap-1.5 shrink-0 uppercase tracking-wider">
          <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-ping" />
          Live Ledger Activity
        </span>
        <div className="flex gap-8 animate-marquee">
          <span>• MAYUR LENT RAHUL: ₹1,500</span>
          <span>• PRIYA REPAID AMIT: ₹750</span>
          <span>• SONIA ADDED CHAI EXPENSE: ₹120</span>
          <span>• VIKRAM CLEARED NET DUE: ₹3,400</span>
          <span>• ROHIT RECORDED GPAY PAYMENT: ₹500</span>
          <span>• ANJALI GAVE CREDIT FOR DINNER: ₹2,100</span>
        </div>
      </div>

      {/* Dynamic Background Mesh Gradients */}
      <div className="absolute top-0 right-0 w-[550px] h-[550px] rounded-full bg-[#10B981]/5 blur-[140px] pointer-events-none z-[-10]" />
      <div className="absolute top-[60vh] left-[-100px] w-[450px] h-[450px] rounded-full bg-[#EF4444]/2 blur-[130px] pointer-events-none z-[-10]" />

      {/* Global Landing Header */}
      <header className="max-w-6xl w-full mx-auto px-6 md:px-8 py-5 flex items-center justify-between relative z-20">
        <div className="flex items-center gap-2">
          <span className="font-extrabold text-base tracking-tight">Khata<span className="text-[#10B981]">Flow</span></span>
          <span className="text-[8px] font-bold tracking-widest text-secondary-text uppercase border border-border-color px-1.5 py-0.5 rounded-[3px] bg-sidebar/60 transition-colors duration-300">
            SECURE LEDGER
          </span>
        </div>

        {/* Header Navigation links (Desktop) */}
        <nav className="hidden md:flex items-center gap-8 text-[11px] font-semibold text-secondary-text tracking-wide transition-colors duration-300">
          <a href="#features" className="hover:text-foreground transition-colors">Features</a>
          <a href="#workflow" className="hover:text-foreground transition-colors">How It Works</a>
          <a href="#security" className="hover:text-foreground transition-colors">Security</a>
        </nav>

        {/* Header actions block */}
        <div className="flex items-center gap-3">
          {/* Visual Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="w-8 h-8 rounded-[4px] border border-border-color hover:bg-card-bg text-secondary-text hover:text-foreground flex items-center justify-center transition-all cursor-pointer bg-sidebar"
            title="Toggle Visual Theme"
          >
            {theme === "dark" ? <Sun size={13} /> : <Moon size={13} />}
          </button>

          {/* CTA Launch button */}
          <button 
            onClick={() => navigate("/login")}
            className="bg-card-bg hover:bg-border-color border border-border-color text-foreground px-3.5 py-1.5 rounded-[4px] text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer"
          >
            <span>Enter Workspace</span>
            <ChevronRight size={11} />
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="max-w-6xl w-full mx-auto px-6 md:px-8 pt-12 md:pt-20 pb-16 relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        
        {/* Left Side Info */}
        <div className="lg:col-span-7 text-left flex flex-col items-start">
          {/* Subheader banner */}
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] border border-border-color bg-sidebar/65 text-[#10B981] text-[9px] font-bold mb-5 tracking-wider uppercase">
            <Sparkles size={10} />
            <span>One Relationship = One Shared Ledger</span>
          </div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-[52px] font-black tracking-tight text-foreground leading-[1.1] mb-5">
            Refine your edge.<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-foreground to-secondary-text">
              Master execution.
            </span>
          </h1>

          {/* Subtext description */}
          <p className="text-secondary-text text-xs sm:text-sm max-w-lg leading-relaxed mb-8 font-medium">
            An institutional-grade portfolio ledger designed for professional relationships. Track balances across multiple shared contacts, analyze outstanding debt metrics, and systematically clear entries.
          </p>

          {/* CTA Button Actions (Matches Reference Image) */}
          <div className="flex flex-row items-center gap-3 w-full sm:w-auto">
            <button 
              onClick={() => navigate("/login")}
              className="bg-accent-text hover:bg-accent-text/90 text-background font-extrabold px-6 py-3 rounded-[4px] text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all shadow-md"
            >
              <span>Enter Dashboard</span>
              <ArrowRight size={13} />
            </button>
            
            <button 
              onClick={() => navigate("/login")}
              className="bg-sidebar hover:bg-card-bg border border-border-color text-foreground font-bold px-6 py-3 rounded-[4px] text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <span>Explore Workspace Guest</span>
            </button>
          </div>
        </div>

        {/* Right Side Mockup Card (Matches Reference Image with Chat Profile Header) */}
        <div className="lg:col-span-5 w-full">
          <div className="w-full bg-sidebar rounded-[4px] p-6 shadow-2xl relative border border-border-color text-left transition-colors duration-300">
            
            {/* WhatsApp-Style Chat Profile Header */}
            <div className="flex items-center justify-between border-b border-border-color pb-4 mb-4 transition-colors duration-300">
              <div className="flex items-center gap-3">
                <img 
                  src="https://api.dicebear.com/7.x/adventurer/svg?seed=Rahul" 
                  alt="Rahul Kumar" 
                  className="w-10 h-10 rounded-[4px] border border-border-color bg-background shrink-0" 
                />
                <div className="text-left">
                  <h4 className="text-xs font-extrabold text-foreground tracking-tight">Rahul Kumar</h4>
                  <p className="text-[9px] text-[#10B981] font-bold flex items-center gap-1.5 mt-0.5 uppercase tracking-wide">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse shrink-0" />
                    Active Sync
                  </p>
                </div>
              </div>
              <span className="text-[9px] font-bold text-[#10B981] bg-[#10B981]/10 border border-[#10B981]/20 px-2 py-0.5 rounded-[3px] font-mono shrink-0">
                +25.0% Profit Curve
              </span>
            </div>

            <div className="mb-4">
              <p className="text-[9px] tracking-widest text-secondary-text font-mono uppercase">LIVE OUTSTANDING BALANCE</p>
              <h3 className="text-2xl font-bold font-mono mt-1 text-foreground">₹12,500.00 <span className="text-xs text-[#10B981] font-black uppercase tracking-wider ml-1">Owed</span></h3>
            </div>

            {/* Sparkline Wave Area SVG (Matches the Reference Image style) */}
            <div className="w-full h-36 bg-background rounded-[3px] border border-border-color relative overflow-hidden flex items-end p-1 transition-colors duration-300">
              <svg className="w-full h-full text-[#10B981]" viewBox="0 0 300 100" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="gradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10B981" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#10B981" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path
                  d="M0,90 Q40,80 60,65 T120,70 T180,45 T240,60 T300,10"
                  fill="none"
                  stroke="#10B981"
                  strokeWidth="2"
                />
                <path
                  d="M0,90 Q40,80 60,65 T120,70 T180,45 T240,60 T300,10 L300,100 L0,100 Z"
                  fill="url(#gradient)"
                />
              </svg>
              {/* Dot decoration */}
              <div className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-[#10B981] animate-ping" />
            </div>

            <div className="mt-4 flex justify-between items-center text-[8px] font-mono text-secondary-text uppercase">
              <span>SAMPLE ACCOUNT ACC-1</span>
              <span>TRADES: 18 LOGGED</span>
            </div>
          </div>
        </div>

      </section>

      {/* Value statement banner */}
      <div className="w-full py-6 border-t border-b border-border-color bg-sidebar/40 text-center text-xs font-bold tracking-wide text-secondary-text">
        A premium, high-density terminal interface built for rapid tracking
      </div>

      {/* Features Grid */}
      <section id="features" className="max-w-6xl w-full mx-auto px-6 md:px-8 py-20 relative z-10">
        <div className="text-center mb-16">
          <h2 className="text-xl sm:text-2xl font-black mb-3">Engineered for Transparency</h2>
          <p className="text-secondary-text text-xs max-w-md mx-auto">No confusing groups. No complex splits. Just clean, 1-on-1 fintech ledgers.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Feature 1 */}
          <div className="bg-sidebar p-6 rounded-[4px] text-left border border-border-color hover:border-secondary-text transition-all">
            <div className="w-9 h-9 rounded-[4px] bg-[#10B981]/10 text-[#10B981] flex items-center justify-center mb-4">
              <Zap size={18} />
            </div>
            <h3 className="text-xs font-bold mb-2 uppercase tracking-wide">Instant Offline Entry</h3>
            <p className="text-[11px] text-secondary-text leading-relaxed font-medium">
              Add relationships instantly. Record credits, expenses, and settlements immediately. No approvals or request systems.
            </p>
          </div>

          {/* Feature 2 */}
          <div className="bg-sidebar p-6 rounded-[4px] text-left border border-border-color hover:border-secondary-text transition-all">
            <div className="w-9 h-9 rounded-[4px] bg-[#10B981]/10 text-[#10B981] flex items-center justify-center mb-4">
              <Share2 size={18} />
            </div>
            <h3 className="text-xs font-bold mb-2 uppercase tracking-wide">WhatsApp Reminders</h3>
            <p className="text-[11px] text-secondary-text leading-relaxed font-medium">
              Send friendly reminders with a single click. Pre-populated templates direct balance links without the awkward chat.
            </p>
          </div>

          {/* Feature 3 */}
          <div className="bg-sidebar p-6 rounded-[4px] text-left border border-border-color hover:border-secondary-text transition-all">
            <div className="w-9 h-9 rounded-[4px] bg-[#10B981]/10 text-[#10B981] flex items-center justify-center mb-4">
              <FileText size={18} />
            </div>
            <h3 className="text-xs font-bold mb-2 uppercase tracking-wide">Printable Statements</h3>
            <p className="text-[11px] text-secondary-text leading-relaxed font-medium">
              Export high-quality transactional ledger histories to PDFs or print stylesheets directly from your phone.
            </p>
          </div>

        </div>
      </section>

      {/* Trust & Security Banner */}
      <section id="security" className="max-w-4xl w-full mx-auto px-6 md:px-8 py-10 mb-16 text-center">
        <div className="bg-sidebar rounded-[4px] p-6 border border-border-color flex flex-col md:flex-row items-center gap-5 text-left">
          <div className="w-10 h-10 rounded-[4px] bg-[#10B981]/15 text-[#10B981] flex items-center justify-center shrink-0">
            <ShieldCheck size={22} />
          </div>
          <div>
            <h3 className="text-sm font-extrabold mb-1 flex items-center gap-2 uppercase tracking-wider">
              Supabase Security Integration
            </h3>
            <p className="text-[11px] text-secondary-text leading-relaxed max-w-xl font-medium">
              KhataFlow operates with dynamic Row Level Security (RLS) policies and JWT authentication. Your financial balances are secure, transparent, and visible only to the participants.
            </p>
          </div>
        </div>
      </section>

      {/* Footer Ribbon */}
      <footer className="border-t border-border-color bg-sidebar py-8 text-center text-xs text-neutral-500 relative z-10 flex flex-col items-center gap-3">
        <div className="flex items-center gap-1">
          <HeartHandshake size={12} className="text-[#10B981]" />
          <span className="font-semibold text-secondary-text">Track Money. Stay Friends.</span>
        </div>
        <p className="text-[9px] text-neutral-600 font-medium">© {new Date().getFullYear()} KhataFlow. Built for personal connections.</p>
        
        {/* Reset Database CTA */}
        <button
          onClick={() => {
            if (confirm("Are you sure you want to completely clear the entire mock database? This will delete all custom registered users, ledgers, transactions, and friends, and reset the app.")) {
              localStorage.clear();
              window.location.reload();
            }
          }}
          className="mt-2 text-[8px] font-bold text-[#EF4444] border border-[#EF4444]/20 hover:border-[#EF4444] hover:bg-[#EF4444]/10 px-2 py-0.5 rounded-[3px] cursor-pointer transition-all uppercase tracking-wider"
        >
          Reset Local Database
        </button>
      </footer>

    </div>
  );
}
