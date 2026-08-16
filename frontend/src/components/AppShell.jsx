import { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Factory, House, Door, Stack, DownloadSimple, FolderOpen, ChartBar,
  Pulse, UsersThree, Gear, SignOut, List, X,
} from "@phosphor-icons/react";
import { useAuth } from "@/context/AuthContext";
import { TopNav } from "@/components/TopNav";
import { GlobalSearch } from "@/components/GlobalSearch";
import { NotificationsBell } from "@/components/NotificationsBell";

const NAV = [
  { section: "TRACK", items: [
    { to: "/office", icon: House, label: "Dashboard", hint: "Live overview", end: true },
    { to: "/office/doors", icon: Door, label: "Doors", hint: "Every door, one click" },
    { to: "/office/jobs", icon: Stack, label: "Jobs", hint: "Levels & release" },
  ]},
  { section: "BRING IN", items: [
    { to: "/office/import", icon: DownloadSimple, label: "Import", hint: "Excel & Drive links" },
    { to: "/files", icon: FolderOpen, label: "Files", hint: "Drawings vault" },
  ]},
  { section: "INSIGHT", items: [
    { to: "/office/reports", icon: ChartBar, label: "Reports", hint: "Progress & QC" },
    { to: "/office/activity", icon: Pulse, label: "Activity", hint: "Who did what" },
  ]},
  { section: "MANAGE", items: [
    { to: "/office/team", icon: UsersThree, label: "Team", hint: "Logins & roles" },
    { to: "/settings", icon: Gear, label: "Settings", hint: "Your account" },
  ]},
];

function NavItems({ onNavigate, idSuffix = "" }) {
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
      {NAV.map((group) => (
        <div key={group.section}>
          <p className="px-3 mb-1.5 font-mono text-[9px] tracking-[0.35em] text-zinc-600">{group.section}</p>
          {group.items.map(({ to, icon: Icon, label, hint, end }) => (
            <NavLink key={to} to={to} end={end} onClick={onNavigate}
              data-testid={`sidenav-${label.toLowerCase()}${idSuffix}`}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 mb-0.5 border-l-2 transition-colors group ${
                  isActive ? "border-ember bg-ember/10 text-white" : "border-transparent text-zinc-400 hover:text-white hover:bg-white/5"
                }`}>
              {({ isActive }) => (
                <>
                  <Icon size={19} weight={isActive ? "fill" : "regular"} className={isActive ? "text-ember" : "text-zinc-500 group-hover:text-zinc-300"} />
                  <span className="flex-1">
                    <span className="block text-sm font-semibold leading-tight">{label}</span>
                    <span className="block font-mono text-[9px] tracking-[0.1em] text-zinc-600">{hint}</span>
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );
}

function SidebarFooter() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="border-t border-white/10 p-4 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{user?.name}</p>
        <p className="font-mono text-[10px] text-zinc-500 truncate">{user?.email}</p>
      </div>
      <button data-testid="logout-btn" title="Sign out"
        onClick={async () => { await logout(); navigate("/login", { replace: true }); }}
        className="w-10 h-10 border border-white/15 flex items-center justify-center text-zinc-400 hover:text-red-400 hover:border-red-500/50 transition-colors shrink-0">
        <SignOut size={18} weight="bold" />
      </button>
    </div>
  );
}

export function AppShell({ children, testId }) {
  const { user } = useAuth();
  const [drawer, setDrawer] = useState(false);

  if (!user || user.role !== "office") {
    return (
      <div className="min-h-screen bg-obsidian text-white" data-testid={testId}>
        <TopNav />
        {children}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-obsidian text-white" data-testid={testId}>
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 flex-col border-r border-white/10 bg-carbon/60 backdrop-blur z-40" data-testid="office-sidebar">
        <Link to="/office" className="flex items-center gap-3 px-5 h-16 border-b border-white/10 shrink-0" data-testid="nav-brand">
          <div className="w-8 h-8 bg-ember flex items-center justify-center">
            <Factory size={18} weight="fill" className="text-black" />
          </div>
          <span className="font-display font-black text-lg tracking-tighter">MAXX DOORS</span>
        </Link>
        <NavItems />
        <SidebarFooter />
      </aside>

      <AnimatePresence>
        {drawer && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 z-40 lg:hidden" onClick={() => setDrawer(false)} />
            <motion.aside initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }}
              transition={{ type: "tween", duration: 0.25 }}
              className="fixed inset-y-0 left-0 w-72 flex flex-col border-r border-white/10 bg-carbon z-50 lg:hidden"
              data-testid="office-drawer">
              <div className="flex items-center justify-between px-5 h-16 border-b border-white/10 shrink-0">
                <span className="font-display font-black text-lg tracking-tighter">MAXX DOORS</span>
                <button onClick={() => setDrawer(false)} className="text-zinc-400" data-testid="drawer-close-btn"><X size={22} /></button>
              </div>
              <NavItems onNavigate={() => setDrawer(false)} idSuffix="-mobile" />
              <SidebarFooter />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 bg-obsidian/95 backdrop-blur border-b border-white/10">
          <div className="flex items-center gap-3 px-4 sm:px-6 h-16">
            <button data-testid="drawer-open-btn" onClick={() => setDrawer(true)}
              className="lg:hidden w-11 h-11 border border-white/15 flex items-center justify-center text-zinc-300 shrink-0">
              <List size={20} weight="bold" />
            </button>
            <GlobalSearch />
            <div className="ml-auto flex items-center gap-3">
              <NotificationsBell />
            </div>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
