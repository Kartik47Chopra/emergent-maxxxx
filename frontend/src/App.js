import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import Lenis from "lenis";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import Login from "@/pages/Login";
import OfficeDashboard from "@/pages/OfficeDashboard";
import JobCreate from "@/pages/JobCreate";
import Station from "@/pages/Station";
import Files from "@/pages/Files";
import Import from "@/pages/Import";
import Doors from "@/pages/Doors";
import DoorDetail from "@/pages/DoorDetail";
import Jobs from "@/pages/Jobs";
import Reports from "@/pages/Reports";
import Team from "@/pages/Team";
import Activity from "@/pages/Activity";
import Settings from "@/pages/Settings";
import ChatWidget from "@/components/ChatWidget";

function SmoothScroll() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (pathname === "/station") return;
    const lenis = new Lenis({ duration: 1.1, smoothWheel: true });
    let raf;
    const loop = (t) => { lenis.raf(t); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); lenis.destroy(); };
  }, [pathname]);
  return null;
}

function RequireAuth({ role, children }) {
  const { user } = useAuth();
  if (user === undefined) {
    return (
      <div className="min-h-screen bg-obsidian flex items-center justify-center">
        <div className="font-mono text-ember text-sm tracking-[0.3em] animate-pulse" data-testid="auth-loading">
          LOADING SYSTEM...
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (role === "office" && user.role !== "office") return <Navigate to="/station" replace />;
  if (role === "operator" && user.role !== "operator") return <Navigate to="/office" replace />;
  return children;
}

function HomeRedirect() {
  const { user } = useAuth();
  if (user === undefined) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === "office" ? "/office" : "/station"} replace />;
}

const OFFICE_ROUTES = [
  ["/office", OfficeDashboard],
  ["/office/doors", Doors],
  ["/office/doors/:doorId", DoorDetail],
  ["/office/jobs", Jobs],
  ["/office/jobs/new", JobCreate],
  ["/office/import", Import],
  ["/office/reports", Reports],
  ["/office/team", Team],
  ["/office/activity", Activity],
];

function Shell() {
  const { user } = useAuth();
  return (
    <>
      <Routes>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/login" element={<Login />} />
        {OFFICE_ROUTES.map(([path, Page]) => (
          <Route key={path} path={path} element={<RequireAuth role="office"><Page /></RequireAuth>} />
        ))}
        <Route path="/files" element={<RequireAuth><Files /></RequireAuth>} />
        <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
        <Route path="/station" element={<RequireAuth role="operator"><Station /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {user && <ChatWidget />}
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SmoothScroll />
        <Toaster theme="dark" position="bottom-right" toastOptions={{
          style: { background: "#121212", border: "1px solid rgba(255,255,255,0.12)", color: "#fff", borderRadius: "2px" },
        }} />
        <Shell />
      </AuthProvider>
    </BrowserRouter>
  );
}
