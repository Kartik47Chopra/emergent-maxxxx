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

function Shell() {
  const { user } = useAuth();
  return (
    <>
      <Routes>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/login" element={<Login />} />
        <Route path="/office" element={<RequireAuth role="office"><OfficeDashboard /></RequireAuth>} />
        <Route path="/office/jobs/new" element={<RequireAuth role="office"><JobCreate /></RequireAuth>} />
        <Route path="/office/import" element={<RequireAuth role="office"><Import /></RequireAuth>} />
        <Route path="/files" element={<RequireAuth><Files /></RequireAuth>} />
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
