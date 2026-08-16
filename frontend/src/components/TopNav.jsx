import { Link, useNavigate } from "react-router-dom";
import { Factory, SignOut } from "@phosphor-icons/react";
import { useAuth } from "@/context/AuthContext";

export function TopNav() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <header className="sticky top-0 z-40 bg-obsidian/95 backdrop-blur border-b border-white/10" data-testid="top-nav">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <Link to={user.role === "office" ? "/office" : "/station"} className="flex items-center gap-3 shrink-0" data-testid="nav-brand">
          <div className="w-8 h-8 bg-ember flex items-center justify-center">
            <Factory size={18} weight="fill" className="text-black" />
          </div>
          <span className="font-display font-black text-lg tracking-tighter hidden sm:block">MAXX DOORS</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link to="/files" data-testid="nav-files" className="font-mono text-xs tracking-[0.2em] text-zinc-400 hover:text-ember transition-colors px-3 py-2">FILES</Link>
          {user.role === "office" ? (
            <>
              <Link to="/office" data-testid="nav-tracking" className="font-mono text-xs tracking-[0.2em] text-zinc-400 hover:text-ember transition-colors px-3 py-2">TRACKING</Link>
              <Link to="/office/import" data-testid="nav-import" className="font-mono text-xs tracking-[0.2em] text-zinc-400 hover:text-ember transition-colors px-3 py-2">IMPORT</Link>
              <Link to="/office/jobs/new" data-testid="nav-new-job" className="font-mono text-xs tracking-[0.2em] text-black bg-ember hover:bg-amber-600 transition-colors px-4 py-2 font-bold">+ NEW JOB</Link>
            </>
          ) : (
            <span data-testid="nav-station-badge" className="font-mono text-xs tracking-[0.25em] text-ember border border-ember/40 bg-ember/10 px-3 py-2">
              {user.station?.toUpperCase()} STATION
            </span>
          )}
          <div className="hidden md:flex flex-col items-end">
            <span className="text-sm font-semibold leading-tight">{user.name}</span>
            <span className="font-mono text-[10px] text-zinc-500">{user.email}</span>
          </div>
          <button
            data-testid="logout-btn"
            onClick={handleLogout}
            className="w-10 h-10 border border-white/15 flex items-center justify-center text-zinc-400 hover:text-red-400 hover:border-red-500/50 transition-colors"
            title="Sign out"
          >
            <SignOut size={18} weight="bold" />
          </button>
        </div>
      </div>
    </header>
  );
}
