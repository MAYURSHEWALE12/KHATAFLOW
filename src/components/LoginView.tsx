import React, { useState } from "react";
import Logo from "./Logo";
import { useKhataStore } from "../store/useKhataStore";
import { ArrowRight, Lock, Mail, ShieldAlert, Sparkles, TrendingUp, User, Eye, EyeOff, Sun, Moon } from "lucide-react";

export default function LoginView() {
  const { signIn, signUp, theme, toggleTheme } = useKhataStore();

  const [activeTab, setActiveTab] = useState<"signin" | "signup">("signin");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    if (!email) {
      setErrorMessage("Please enter your email.");
      return;
    }
    if (!password) {
      setErrorMessage("Please enter a password.");
      return;
    }

    if (activeTab === "signup") {
      if (!name) {
        setErrorMessage("Please enter your full name.");
        return;
      }
      if (password.length < 6) {
        setErrorMessage("Password must be at least 6 characters.");
        return;
      }
      if (password !== confirmPassword) {
        setErrorMessage("Passwords do not match.");
        return;
      }
    }

    setIsLoading(true);

    if (activeTab === "signup") {
      const err = await signUp(email, password, name);
      if (err) {
        setErrorMessage(err);
        setIsLoading(false);
      } else {
        setSuccessMessage("Account created successfully! Welcome to KhataFlow.");
        setTimeout(() => {
          setIsLoading(false);
          window.location.href = "/dashboard";
        }, 500);
      }
    } else {
      const err = await signIn(email, password);
      if (err) {
        setErrorMessage(err);
        setIsLoading(false);
      } else {
        setSuccessMessage("Signed in successfully!");
        setTimeout(() => {
          setIsLoading(false);
          window.location.href = "/dashboard";
        }, 500);
      }
    }
  };

  const handleGoogleLogin = () => {
    setErrorMessage("Google OAuth is not configured yet. Please sign in with email.");
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-background text-foreground overflow-y-auto px-4 py-12 transition-colors duration-300">
      <button
        onClick={toggleTheme}
        className="absolute top-6 right-6 w-10 h-10 rounded-[4px] border border-[#26272B] bg-[#151618]/60 hover:bg-[#26272B] text-[#A1A1AA] hover:text-[#F5F5F5] flex items-center justify-center transition-all cursor-pointer z-50 shadow-sm"
        title="Toggle Visual Theme"
      >
        {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
      </button>

      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] rounded-full bg-[#10B981] opacity-[0.08] blur-[120px] animate-pulse-glow" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-[400px] h-[400px] rounded-full bg-[#EF4444] opacity-[0.02] blur-[150px]" />

      <div className="w-full max-w-md relative z-10 space-y-6">

        <div className="text-center flex flex-col items-center">
          <div className="mb-4">
            <Logo size={64} className="text-foreground shrink-0" />
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#26272B] bg-[#111214]/80 text-[#10B981] text-xs font-semibold mb-4 backdrop-blur-md">
            <TrendingUp size={13} />
            <span>Shared Ledger Platform</span>
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-[#F5F5F5] mb-2">
            Khata<span className="text-[#10B981]">Flow</span>
          </h1>
          <p className="text-[#A1A1AA] text-xs font-medium">Track Money. Stay Friends.</p>
        </div>

        <div className="glass rounded-[4px] p-7 shadow-2xl border border-[#26272B] bg-[#111214]/70">

          <div className="flex border-b border-[#26272B] mb-6">
            <button
              onClick={() => {
                setActiveTab("signin");
                setErrorMessage("");
              }}
              className={`flex-1 pb-3 text-sm font-bold border-b-2 transition-all cursor-pointer ${
                activeTab === "signin"
                  ? "border-[#10B981] text-[#F5F5F5]"
                  : "border-transparent text-[#A1A1AA] hover:text-[#F5F5F5]"
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => {
                setActiveTab("signup");
                setErrorMessage("");
              }}
              className={`flex-1 pb-3 text-sm font-bold border-b-2 transition-all cursor-pointer ${
                activeTab === "signup"
                  ? "border-[#10B981] text-[#F5F5F5]"
                  : "border-transparent text-[#A1A1AA] hover:text-[#F5F5F5]"
              }`}
            >
              Create Account
            </button>
          </div>

          {errorMessage && (
            <div className="mb-4 flex items-center gap-2 p-3 rounded-[4px] bg-[#EF4444]/10 border border-[#EF4444]/20 text-[#EF4444] text-xs text-left">
              <ShieldAlert size={16} />
              <span>{errorMessage}</span>
            </div>
          )}
          {successMessage && (
            <div className="mb-4 flex items-center gap-2 p-3 rounded-[4px] bg-[#10B981]/10 border border-[#10B981]/20 text-[#10B981] text-xs text-left">
              <Sparkles size={16} className="animate-spin" />
              <span>{successMessage}</span>
            </div>
          )}

          <form onSubmit={handleAuthSubmit} className="space-y-4 text-left">

            {activeTab === "signup" && (
              <div>
                <label className="block text-[10px] font-bold text-[#A1A1AA] uppercase tracking-wider mb-2">
                  Full Name
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-[#A1A1AA]">
                    <User size={15} />
                  </span>
                  <input
                    type="text"
                    placeholder="Your full name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-background border border-[#26272B] rounded-[4px] py-3 pl-10 pr-4 text-xs text-[#F5F5F5] placeholder-[#A1A1AA]/40 focus:outline-none focus:border-[#10B981] transition-all"
                    required
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-[10px] font-bold text-[#A1A1AA] uppercase tracking-wider mb-2">
                Email Address
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-[#A1A1AA]">
                  <Mail size={15} />
                </span>
                <input
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-background border border-[#26272B] rounded-[4px] py-3 pl-10 pr-4 text-xs text-[#F5F5F5] placeholder-[#A1A1AA]/40 focus:outline-none focus:border-[#10B981] transition-all"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-[#A1A1AA] uppercase tracking-wider mb-2">
                Password
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-[#A1A1AA]">
                  <Lock size={15} />
                </span>
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-background border border-[#26272B] rounded-[4px] py-3 pl-10 pr-10 text-xs text-[#F5F5F5] placeholder-[#A1A1AA]/40 focus:outline-none focus:border-[#10B981] transition-all"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#A1A1AA]/60 hover:text-[#F5F5F5]"
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {activeTab === "signup" && (
              <div>
                <label className="block text-[10px] font-bold text-[#A1A1AA] uppercase tracking-wider mb-2">
                  Confirm Password
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-[#A1A1AA]">
                    <Lock size={15} />
                  </span>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full bg-background border border-[#26272B] rounded-[4px] py-3 pl-10 pr-4 text-xs text-[#F5F5F5] placeholder-[#A1A1AA]/40 focus:outline-none focus:border-[#10B981] transition-all"
                    required
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-[#10B981] hover:bg-[#059669] text-[#0A0A0B] font-extrabold py-3 px-4 rounded-[4px] text-xs flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50 shadow-lg shadow-[#10B981]/15 mt-2"
            >
              {isLoading
                ? (activeTab === "signup" ? "Creating Account..." : "Signing In...")
                : (activeTab === "signup" ? "Create Account & Start" : "Sign In with Email")
              }
              {!isLoading && <ArrowRight size={15} />}
            </button>
          </form>

          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#26272B]" />
            </div>
            <div className="relative flex justify-center text-[10px] uppercase">
              <span className="bg-[#111214] px-2.5 text-[#A1A1AA]">Or connect with</span>
            </div>
          </div>

          <div className="grid grid-cols-1">
            <button
              onClick={handleGoogleLogin}
              disabled={isLoading}
              className="bg-[#151618] hover:bg-[#26272B] text-[#F5F5F5] border border-[#26272B] font-semibold py-2.5 px-3 rounded-[4px] text-[11px] flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            >
              <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>Google</span>
            </button>
          </div>

        </div>

        <p className="text-[10px] text-neutral-500 text-center font-medium">
          By continuing, you agree to KhataFlow's terms of friendly relationship tracking.
        </p>

      </div>
    </div>
  );
}
