import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { LockKey, Gear, FloppyDisk } from "@phosphor-icons/react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { AppShell } from "@/components/AppShell";

const inputCls = "w-full h-12 bg-black/50 border border-white/15 px-4 text-sm placeholder:text-zinc-600 focus:outline-none focus:border-ember transition-colors";

function PasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const mut = useMutation({
    mutationFn: () => api.post("/auth/change-password", { current_password: current, new_password: next }),
    onSuccess: () => { toast.success("Password changed"); setCurrent(""); setNext(""); },
    onError: (e) => toast.error(apiError(e)),
  });
  return (
    <div className="border border-white/10 bg-carbon p-6 space-y-4" data-testid="settings-password-card">
      <p className="font-mono text-[10px] tracking-[0.3em] text-ember flex items-center gap-2"><LockKey size={14} /> CHANGE YOUR PASSWORD</p>
      <input data-testid="settings-current-password" type="password" placeholder="Current password" value={current} onChange={(e) => setCurrent(e.target.value)} className={inputCls} />
      <input data-testid="settings-new-password" type="password" placeholder="New password (8+ characters)" value={next} onChange={(e) => setNext(e.target.value)} className={inputCls} />
      <button data-testid="settings-password-btn" onClick={() => mut.mutate()} disabled={!current || next.length < 8 || mut.isPending}
        className="h-12 px-6 bg-ember text-black font-display font-bold hover:bg-amber-600 transition-colors disabled:opacity-40">
        {mut.isPending ? "SAVING…" : "UPDATE PASSWORD"}
      </button>
    </div>
  );
}

function AppSettingsCard() {
  const qc = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: () => api.get("/settings").then((r) => r.data) });
  const [form, setForm] = useState(null);
  useEffect(() => { if (settings && !form) setForm(settings); }, [settings, form]);
  const mut = useMutation({
    mutationFn: () => api.put("/settings", {
      company_name: form.company_name, project_name: form.project_name,
      sticker_footer: form.sticker_footer, auto_release_imports: form.auto_release_imports,
    }),
    onSuccess: () => { toast.success("Settings saved"); qc.invalidateQueries({ queryKey: ["settings"] }); },
    onError: (e) => toast.error(apiError(e)),
  });
  if (!form) return null;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <div className="border border-white/10 bg-carbon p-6 space-y-4" data-testid="settings-app-card">
      <p className="font-mono text-[10px] tracking-[0.3em] text-ember flex items-center gap-2"><Gear size={14} /> FACTORY SETTINGS</p>
      <div>
        <label className="font-mono text-[10px] tracking-[0.2em] text-zinc-500 block mb-1">COMPANY NAME</label>
        <input data-testid="settings-company" value={form.company_name} onChange={(e) => set("company_name", e.target.value)} className={inputCls} />
      </div>
      <div>
        <label className="font-mono text-[10px] tracking-[0.2em] text-zinc-500 block mb-1">CURRENT PROJECT</label>
        <input data-testid="settings-project" value={form.project_name} onChange={(e) => set("project_name", e.target.value)} className={inputCls} />
      </div>
      <div>
        <label className="font-mono text-[10px] tracking-[0.2em] text-zinc-500 block mb-1">STICKER FOOTER TEXT</label>
        <input data-testid="settings-footer" value={form.sticker_footer} onChange={(e) => set("sticker_footer", e.target.value)} className={inputCls} />
      </div>
      <label className="flex items-center gap-3 cursor-pointer border border-white/10 bg-black/40 px-4 py-3">
        <input type="checkbox" data-testid="settings-auto-release" checked={form.auto_release_imports}
          onChange={(e) => set("auto_release_imports", e.target.checked)} className="w-5 h-5 accent-amber-500" />
        <span>
          <span className="block text-sm font-semibold">Release imports straight to the factory</span>
          <span className="block text-xs text-zinc-500">When on, imported levels skip the draft step and appear on the tablets immediately</span>
        </span>
      </label>
      <button data-testid="settings-save-btn" onClick={() => mut.mutate()} disabled={mut.isPending}
        className="h-12 px-6 bg-ember text-black font-display font-bold flex items-center gap-2 hover:bg-amber-600 transition-colors disabled:opacity-40">
        <FloppyDisk size={18} weight="bold" /> {mut.isPending ? "SAVING…" : "SAVE SETTINGS"}
      </button>
    </div>
  );
}

export default function Settings() {
  const { user } = useAuth();
  return (
    <AppShell testId="settings-page">
      <main className="max-w-[900px] mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div>
          <p className="font-mono text-[10px] tracking-[0.3em] text-ember">YOUR ACCOUNT & THE APP</p>
          <h1 className="font-display font-black text-4xl sm:text-5xl tracking-tighter mt-1">Settings</h1>
        </div>
        <PasswordCard />
        {user?.role === "office" && <AppSettingsCard />}
      </main>
    </AppShell>
  );
}
