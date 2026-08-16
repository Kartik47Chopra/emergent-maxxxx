import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Factory, ShieldCheck } from "@phosphor-icons/react";
import { useAuth } from "@/context/AuthContext";
import { apiError } from "@/lib/api";

const HERO_IMG = "https://images.unsplash.com/photo-1564182998523-6923112e7d6b?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1ODR8MHwxfHNlYXJjaHwyfHxpbmR1c3RyaWFsJTIwd2VsZGluZyUyMHNwYXJrcyUyMGRhcmt8ZW58MHx8fHwxNzg2ODg5NjU3fDA&ixlib=rb-4.1.0&q=85";
const LINES = ["PRECISION", "FIRE-RATED", "DOOR SYSTEMS"];
const MARQUEE = ["CORE", "SKIN", "ASSEMBLY", "PRESS", "ROUTING", "DESPATCH"];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const user = await login(email, password);
      navigate(user.role === "office" ? "/office" : "/station", { replace: true });
    } catch (err) {
      setError(apiError(err, "Login failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-obsidian text-white grid lg:grid-cols-2 relative overflow-hidden" data-testid="login-page">
      <div className="relative hidden lg:block grain overflow-hidden">
        <img src={HERO_IMG} alt="Industrial sparks" className="absolute inset-0 w-full h-full object-cover opacity-70" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/40 via-black/60 to-obsidian" />
        <div className="absolute inset-0 blueprint-grid opacity-60" />
        <div className="relative z-10 h-full flex flex-col justify-between p-12">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-ember flex items-center justify-center">
              <Factory size={22} weight="fill" className="text-black" />
            </div>
            <span className="font-mono text-xs tracking-[0.35em] text-zinc-300">MAXX DOORS / MFG</span>
          </div>
          <div>
            <div className="hazard-stripes h-2 w-32 mb-8" />
            {LINES.map((line, i) => (
              <div key={line} className="overflow-hidden">
                <motion.h1
                  initial={{ y: "110%" }}
                  animate={{ y: 0 }}
                  transition={{ delay: 0.25 + i * 0.14, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                  className="font-display font-black text-6xl xl:text-7xl tracking-tighter leading-[0.95]"
                >
                  {line === "FIRE-RATED" ? <span className="text-ember">{line}</span> : line}
                </motion.h1>
              </div>
            ))}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.9, duration: 0.8 }}
              className="mt-6 max-w-md text-zinc-400 text-base"
            >
              Live production tracking from part number to despatch. Every core, every skin,
              every door — accounted for on the factory floor.
            </motion.p>
          </div>
          <div className="overflow-hidden border-t border-white/10 pt-4">
            <div className="flex whitespace-nowrap animate-marquee w-max">
              {[...MARQUEE, ...MARQUEE, ...MARQUEE, ...MARQUEE].map((w, i) => (
                <span key={i} className="font-mono text-xs tracking-[0.4em] text-zinc-500 mr-10">
                  {w} <span className="text-ember ml-4">/</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="relative flex items-center justify-center p-6 sm:p-12 blueprint-grid">
        <img src={HERO_IMG} alt="" className="lg:hidden absolute inset-0 w-full h-full object-cover opacity-20" />
        <div className="lg:hidden absolute inset-0 bg-gradient-to-b from-obsidian/70 to-obsidian" />
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-10 w-full max-w-md"
        >
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <div className="w-10 h-10 bg-ember flex items-center justify-center">
              <Factory size={22} weight="fill" className="text-black" />
            </div>
            <span className="font-display font-black text-2xl tracking-tighter">MAXX DOORS</span>
          </div>
          <div className="border border-white/15 bg-carbon/90 backdrop-blur-sm">
            <div className="border-b border-white/10 px-8 py-5 flex items-center justify-between">
              <div>
                <p className="font-mono text-[10px] tracking-[0.3em] text-ember">SYSTEM ACCESS</p>
                <h2 className="font-display font-extrabold text-2xl tracking-tight mt-1">Sign in to the floor</h2>
              </div>
              <ShieldCheck size={28} className="text-zinc-600" />
            </div>
            <form onSubmit={submit} className="p-8 space-y-5">
              <div>
                <label htmlFor="login-email" className="font-mono text-[10px] tracking-[0.25em] text-zinc-500 block mb-2">OPERATOR EMAIL</label>
                <input
                  id="login-email"
                  data-testid="login-email-input"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="core@maxxdoors.com"
                  className="w-full h-14 bg-black/60 border border-white/15 px-4 font-mono text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-ember focus:border-2 transition-colors"
                />
              </div>
              <div>
                <label htmlFor="login-password" className="font-mono text-[10px] tracking-[0.25em] text-zinc-500 block mb-2">PASSWORD</label>
                <input
                  id="login-password"
                  data-testid="login-password-input"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••"
                  className="w-full h-14 bg-black/60 border border-white/15 px-4 font-mono text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-ember focus:border-2 transition-colors"
                />
              </div>
              {error && (
                <div data-testid="login-error" className="border border-red-500/50 bg-red-500/10 text-red-400 text-sm px-4 py-3 font-mono">
                  {error}
                </div>
              )}
              <button
                type="submit"
                data-testid="login-submit-btn"
                disabled={busy}
                className="w-full h-14 bg-ember text-black font-display font-extrabold tracking-wide text-base flex items-center justify-center gap-2 hover:bg-amber-600 active:translate-y-px transition-colors disabled:opacity-60"
              >
                {busy ? "AUTHENTICATING..." : "ENTER PRODUCTION"}
                <ArrowRight size={20} weight="bold" />
              </button>
            </form>
            <div className="border-t border-white/10 px-8 py-4">
              <p className="font-mono text-[10px] tracking-[0.2em] text-zinc-400 leading-relaxed">
                OFFICE: office@maxxdoors.com &nbsp;/&nbsp; STATIONS: core@ · skin@ · assembly@ · press@ · routing@maxxdoors.com
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
