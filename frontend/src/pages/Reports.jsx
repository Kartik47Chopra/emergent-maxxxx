import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Printer, Truck, WarningCircle, Trophy } from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { AppShell } from "@/components/AppShell";
import { timeAgo } from "@/lib/format";

const STAGES = ["core", "skin", "assembly", "press", "routing", "despatch"];
const STAGE_LABEL = { core: "Core", skin: "Skin", assembly: "Assembly", press: "Press", routing: "Routing/QC", despatch: "Despatch" };

function Bar({ value, max, tone = "bg-ember" }) {
  const pct = max ? Math.round((100 * value) / max) : 0;
  return (
    <div className="h-2.5 bg-black/60 border border-white/10 flex-1">
      <div className={`h-full ${tone} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function Reports() {
  const { data: overview } = useQuery({ queryKey: ["an-overview"], queryFn: () => api.get("/analytics/overview").then((r) => r.data), refetchInterval: 10000 });
  const { data: floors = [] } = useQuery({ queryKey: ["an-floors"], queryFn: () => api.get("/analytics/floors").then((r) => r.data), refetchInterval: 10000 });
  const { data: stations = [] } = useQuery({ queryKey: ["an-stations"], queryFn: () => api.get("/analytics/stations").then((r) => r.data), refetchInterval: 10000 });
  const { data: qcData } = useQuery({ queryKey: ["an-qc"], queryFn: () => api.get("/analytics/qc").then((r) => r.data), refetchInterval: 10000 });
  const { data: leaderboard = [] } = useQuery({ queryKey: ["an-leaderboard"], queryFn: () => api.get("/analytics/leaderboard").then((r) => r.data), refetchInterval: 15000 });
  const { data: manifest } = useQuery({ queryKey: ["manifest"], queryFn: () => api.get("/despatch/manifest").then((r) => r.data), refetchInterval: 10000 });

  return (
    <AppShell testId="reports-page">
      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8 space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] tracking-[0.3em] text-ember">HOW THE FACTORY IS DOING</p>
            <h1 className="font-display font-black text-4xl sm:text-5xl tracking-tighter mt-1">Reports</h1>
          </div>
          <button data-testid="reports-print-btn" onClick={() => window.print()}
            className="h-12 px-5 border border-white/20 font-display font-bold flex items-center gap-2 hover:border-ember hover:text-ember transition-colors">
            <Printer size={18} weight="bold" /> PRINT THIS PAGE
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[["TOTAL DOORS", overview?.total_doors], ["OVERALL COMPLETE", overview ? `${overview.overall_percent}%` : "—"],
            ["JOBS RELEASED", overview ? `${overview.jobs_released}/${overview.jobs_total}` : "—"], ["FILES IN VAULT", overview?.files_total]].map(([label, value], i) => (
            <motion.div key={label} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
              className="border border-white/10 bg-carbon p-5" data-testid={`report-stat-${i}`}>
              <p className="font-mono text-[10px] tracking-[0.25em] text-zinc-500">{label}</p>
              <p className="font-display font-black text-4xl tracking-tighter mt-3">{value ?? "—"}</p>
            </motion.div>
          ))}
        </div>

        <div className="grid lg:grid-cols-2 gap-4 items-start">
          <div className="border border-white/10 bg-carbon p-6" data-testid="report-floors">
            <p className="font-mono text-[10px] tracking-[0.3em] text-ember mb-5">PROGRESS BY LEVEL</p>
            <div className="space-y-4">
              {floors.map((f) => (
                <div key={f.floor}>
                  <div className="flex justify-between mb-1.5">
                    <span className="font-mono text-xs font-bold">{f.floor}</span>
                    <span className="font-mono text-xs text-zinc-500">{f.percent}% · {f.per_stage.despatch}/{f.total} delivered</span>
                  </div>
                  <Bar value={f.percent} max={100} />
                </div>
              ))}
              {!floors.length && <p className="font-mono text-xs text-zinc-600">NO DATA YET</p>}
            </div>
          </div>

          <div className="border border-white/10 bg-carbon p-6" data-testid="report-stations">
            <p className="font-mono text-[10px] tracking-[0.3em] text-ember mb-5">WORK DONE PER STATION</p>
            <div className="space-y-4">
              {STAGES.slice(0, 5).map((s) => {
                const st = stations.find((x) => x.station === s);
                const total = (st?.completed || 0) + (st?.pending || 0);
                return (
                  <div key={s}>
                    <div className="flex justify-between mb-1.5">
                      <span className="font-mono text-xs font-bold uppercase">{STAGE_LABEL[s]}</span>
                      <span className="font-mono text-xs text-zinc-500">
                        {st?.completed || 0} done · {st?.pending || 0} waiting
                        {st?.last_activity ? ` · last ${timeAgo(st.last_activity.at)}` : ""}
                      </span>
                    </div>
                    <Bar value={st?.completed || 0} max={total} tone="bg-emerald-500" />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="border border-white/10 bg-carbon p-6" data-testid="report-qc">
            <p className="font-mono text-[10px] tracking-[0.3em] text-ember mb-5">QUALITY CONTROL</p>
            <div className="grid grid-cols-3 gap-3 mb-5">
              {[["PASSED", qcData?.passed, "text-emerald-400"], ["FAILED", qcData?.failed, "text-red-400"], ["NOT CHECKED", qcData?.pending, "text-zinc-400"]].map(([l, v, tone]) => (
                <div key={l} className="border border-white/10 bg-black/40 p-3 text-center">
                  <p className={`font-display font-black text-3xl ${tone}`}>{v ?? "—"}</p>
                  <p className="font-mono text-[9px] tracking-[0.2em] text-zinc-600 mt-1">{l}</p>
                </div>
              ))}
            </div>
            {(qcData?.failures || []).map((f) => (
              <div key={f.door_id} className="flex items-start gap-2 text-sm border-t border-white/5 py-2">
                <WarningCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
                <p><span className="font-mono font-bold text-red-300">{f.door_id}</span>
                  <span className="text-zinc-500"> ({f.floor}) — {f.notes || "no notes"}</span></p>
              </div>
            ))}
            {!(qcData?.failures || []).length && <p className="font-mono text-[11px] text-zinc-600 tracking-[0.1em]">NO QC FAILURES — CLEAN SHEET</p>}
          </div>

          <div className="border border-white/10 bg-carbon p-6" data-testid="report-leaderboard">
            <p className="font-mono text-[10px] tracking-[0.3em] text-ember mb-5 flex items-center gap-2"><Trophy size={14} /> OPERATOR LEADERBOARD</p>
            <div className="space-y-2">
              {leaderboard.map((u, i) => (
                <div key={u.user} className="flex items-center gap-3 border border-white/10 bg-black/40 px-4 py-2.5">
                  <span className="font-display font-black text-xl text-ember/70 w-7">{i + 1}</span>
                  <span className="text-sm font-semibold flex-1">{u.user}</span>
                  <span className="font-mono text-xs text-zinc-400">{u.completed} stages · {timeAgo(u.last_at)}</span>
                </div>
              ))}
              {!leaderboard.length && <p className="font-mono text-[11px] text-zinc-600 tracking-[0.1em]">NO COMPLETIONS LOGGED YET</p>}
            </div>
          </div>
        </div>

        <div className="border border-white/10 bg-carbon p-6" data-testid="report-manifest">
          <p className="font-mono text-[10px] tracking-[0.3em] text-ember mb-4 flex items-center gap-2"><Truck size={14} /> READY TO SHIP — DESPATCH MANIFEST</p>
          {(manifest?.floors || []).length === 0 && <p className="font-mono text-[11px] text-zinc-600 tracking-[0.1em]">NOTHING WAITING ON THE DOCK — DOORS APPEAR HERE ONCE THEY PASS QC</p>}
          {(manifest?.floors || []).map((f) => (
            <div key={f.floor} className="mb-4">
              <p className="font-mono text-xs font-bold mb-2">{f.floor} — {f.doors.length} door{f.doors.length === 1 ? "" : "s"}</p>
              <div className="flex flex-wrap gap-2">
                {f.doors.map((d) => (
                  <span key={d.door_id} className="font-mono text-[11px] border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 px-2.5 py-1">
                    {d.door_id} · {d.location}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </main>
    </AppShell>
  );
}
