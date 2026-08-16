import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UsersThree, Plus, Key, Trash, X, Copy } from "@phosphor-icons/react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { AppShell } from "@/components/AppShell";

const STATIONS = ["core", "skin", "assembly", "press", "routing"];
const EMPTY = { email: "", name: "", role: "operator", station: "core", password: "" };

function AddUserModal({ onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(EMPTY);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const mut = useMutation({
    mutationFn: () => api.post("/users", { ...form, station: form.role === "operator" ? form.station : null }),
    onSuccess: () => { toast.success(`${form.name} can now sign in`); qc.invalidateQueries({ queryKey: ["users"] }); onClose(); },
    onError: (e) => toast.error(apiError(e)),
  });
  const inputCls = "w-full h-12 bg-black/50 border border-white/15 px-4 text-sm placeholder:text-zinc-600 focus:outline-none focus:border-ember transition-colors";
  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4" data-testid="add-user-modal">
      <div className="w-full max-w-md border border-white/15 bg-carbon p-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="font-mono text-xs tracking-[0.25em] text-ember">ADD A TEAM MEMBER</p>
          <button onClick={onClose} data-testid="add-user-close" className="text-zinc-400 hover:text-white"><X size={20} weight="bold" /></button>
        </div>
        <input data-testid="add-user-name" placeholder="Full name" value={form.name} onChange={(e) => set("name", e.target.value)} className={inputCls} />
        <input data-testid="add-user-email" placeholder="Email (they sign in with this)" value={form.email} onChange={(e) => set("email", e.target.value)} className={inputCls} />
        <input data-testid="add-user-password" placeholder="Password (8+ characters)" value={form.password} onChange={(e) => set("password", e.target.value)} className={inputCls} />
        <div className="grid grid-cols-2 gap-3">
          <select data-testid="add-user-role" value={form.role} onChange={(e) => set("role", e.target.value)} className={inputCls}>
            <option value="operator">Factory operator</option>
            <option value="office">Office staff</option>
          </select>
          {form.role === "operator" && (
            <select data-testid="add-user-station" value={form.station} onChange={(e) => set("station", e.target.value)} className={inputCls}>
              {STATIONS.map((s) => <option key={s} value={s}>{s.toUpperCase()} station</option>)}
            </select>
          )}
        </div>
        <button data-testid="add-user-submit" onClick={() => mut.mutate()}
          disabled={!form.name.trim() || !form.email.trim() || form.password.length < 8 || mut.isPending}
          className="w-full h-14 bg-ember text-black font-display font-extrabold hover:bg-amber-600 transition-colors disabled:opacity-40">
          {mut.isPending ? "CREATING…" : "CREATE LOGIN"}
        </button>
      </div>
    </div>
  );
}

export default function Team() {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [resetInfo, setResetInfo] = useState(null);

  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get("/users").then((r) => r.data),
  });

  const resetMut = useMutation({
    mutationFn: (id) => api.post(`/users/${id}/reset-password`, {}),
    onSuccess: (r, id) => setResetInfo({ id, password: r.data.password }),
    onError: (e) => toast.error(apiError(e)),
  });
  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/users/${id}`),
    onSuccess: () => { toast.success("Login removed"); qc.invalidateQueries({ queryKey: ["users"] }); },
    onError: (e) => toast.error(apiError(e)),
  });

  return (
    <AppShell testId="team-page">
      <main className="max-w-[1100px] mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] tracking-[0.3em] text-ember">WHO CAN SIGN IN</p>
            <h1 className="font-display font-black text-4xl sm:text-5xl tracking-tighter mt-1">Team</h1>
            <p className="text-zinc-400 text-sm mt-2">Office staff see everything. Operators only see their own station's tablet screen.</p>
          </div>
          <button data-testid="team-add-btn" onClick={() => setAdding(true)}
            className="h-12 px-5 bg-ember text-black font-display font-bold flex items-center gap-2 hover:bg-amber-600 transition-colors">
            <Plus size={18} weight="bold" /> ADD PERSON
          </button>
        </div>

        <div className="border border-white/10 bg-carbon divide-y divide-white/5" data-testid="team-list">
          {users.map((u) => (
            <div key={u.id} className="flex flex-wrap items-center gap-4 px-5 py-4" data-testid={`team-row-${u.id}`}>
              <div className="w-11 h-11 border border-white/15 bg-black/40 flex items-center justify-center shrink-0">
                <UsersThree size={20} className="text-zinc-400" />
              </div>
              <div className="flex-1 min-w-[160px]">
                <p className="font-semibold">{u.name} {u.id === me?.id && <span className="font-mono text-[9px] text-ember">(YOU)</span>}</p>
                <p className="font-mono text-[11px] text-zinc-500">{u.email}</p>
              </div>
              <span className={`font-mono text-[10px] tracking-[0.15em] px-3 py-1.5 border ${
                u.role === "office" ? "text-ember border-ember/40 bg-ember/10" : "text-blue-400 border-blue-500/40 bg-blue-500/10"
              }`}>
                {u.role === "office" ? "OFFICE" : `${(u.station || "").toUpperCase()} STATION`}
              </span>
              {resetInfo?.id === u.id ? (
                <button data-testid={`team-copy-pw-${u.id}`}
                  onClick={() => { navigator.clipboard?.writeText(resetInfo.password); toast.success("Password copied"); }}
                  className="h-10 px-3 border border-emerald-500/50 bg-emerald-500/10 text-emerald-300 font-mono text-[11px] flex items-center gap-2">
                  <Copy size={14} /> {resetInfo.password}
                </button>
              ) : (
                <button data-testid={`team-reset-${u.id}`} onClick={() => resetMut.mutate(u.id)} title="Reset password"
                  className="h-10 w-10 border border-white/15 flex items-center justify-center text-zinc-400 hover:text-amber-400 hover:border-amber-500/50 transition-colors">
                  <Key size={16} weight="bold" />
                </button>
              )}
              <button data-testid={`team-delete-${u.id}`} disabled={u.id === me?.id}
                onClick={() => window.confirm(`Remove ${u.name}'s login?`) && deleteMut.mutate(u.id)}
                className="h-10 w-10 border border-white/15 flex items-center justify-center text-zinc-400 hover:text-red-400 hover:border-red-500/50 transition-colors disabled:opacity-30">
                <Trash size={16} weight="bold" />
              </button>
            </div>
          ))}
        </div>
        <p className="font-mono text-[10px] text-zinc-600 tracking-[0.1em]">TIP: THE KEY BUTTON MAKES A NEW PASSWORD — COPY IT AND HAND IT TO THEM.</p>
      </main>
      {adding && <AddUserModal onClose={() => setAdding(false)} />}
    </AppShell>
  );
}
