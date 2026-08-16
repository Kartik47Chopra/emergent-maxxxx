import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { MagnifyingGlass, Package, Truck, WarningCircle, CheckCircle, RocketLaunch, X } from "@phosphor-icons/react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { TopNav } from "@/components/TopNav";
import { StatusPill, stageStatus } from "@/components/StatusPill";
import { DoorFiles } from "@/components/DoorFiles";

const STAGE_COLS = ["core", "skin", "assembly", "press", "routing", "despatch"];

function StatCard({ icon: Icon, label, value, tone = "text-white", testId, delay }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="border border-white/10 bg-carbon p-5"
      data-testid={testId}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] tracking-[0.25em] text-zinc-500">{label}</span>
        <Icon size={18} className="text-zinc-600" />
      </div>
      <p className={`font-display font-black text-4xl tracking-tighter mt-3 ${tone}`}>{value}</p>
    </motion.div>
  );
}

export default function OfficeDashboard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [floor, setFloor] = useState("");
  const [search, setSearch] = useState("");
  const [photoDoor, setPhotoDoor] = useState(null);

  const { data: stats } = useQuery({
    queryKey: ["stats"],
    queryFn: () => api.get("/stats").then((r) => r.data),
    refetchInterval: 6000,
  });
  const { data: doors = [] } = useQuery({
    queryKey: ["doors", floor, search],
    queryFn: () => api.get("/doors", { params: { floor: floor || undefined, q: search || undefined } }).then((r) => r.data),
    refetchInterval: 6000,
  });
  const { data: jobs = [] } = useQuery({
    queryKey: ["jobs"],
    queryFn: () => api.get("/jobs").then((r) => r.data),
    refetchInterval: 8000,
  });

  const floors = useMemo(() => [...new Set(doors.map((d) => d.floor))].sort(), [doors]);
  const unreleased = jobs.filter((j) => !j.released);

  const releaseMut = useMutation({
    mutationFn: (jobId) => api.post(`/jobs/${jobId}/release`),
    onSuccess: () => { toast.success("Job released to the factory floor"); qc.invalidateQueries({ queryKey: ["jobs"] }); },
    onError: (e) => toast.error(apiError(e)),
  });
  const despatchMut = useMutation({
    mutationFn: (doorId) => api.post(`/doors/${encodeURIComponent(doorId)}/despatch`),
    onSuccess: (_, doorId) => { toast.success(`${doorId} despatched`); qc.invalidateQueries(); },
    onError: (e) => toast.error(apiError(e)),
  });

  return (
    <div className="min-h-screen bg-obsidian text-white" data-testid="office-dashboard">
      <TopNav />
      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 py-8 space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] tracking-[0.3em] text-ember">OFFICE CONTROL ROOM</p>
            <h1 className="font-display font-black text-4xl sm:text-5xl tracking-tighter mt-1">Production Tracking</h1>
          </div>
          <p className="font-mono text-xs text-zinc-500">LIVE FEED · REFRESH 6S</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Package} label="TOTAL DOORS" value={stats?.total ?? "—"} testId="stat-total" delay={0} />
          <StatCard icon={RocketLaunch} label="IN PRODUCTION" value={stats?.in_production ?? "—"} tone="text-ember" testId="stat-production" delay={0.08} />
          <StatCard icon={Truck} label="AWAITING DESPATCH" value={stats?.awaiting_despatch ?? "—"} tone="text-blue-400" testId="stat-awaiting" delay={0.16} />
          <StatCard icon={WarningCircle} label="QC FAILURES" value={stats?.qc_failed ?? "—"} tone="text-red-400" testId="stat-failed" delay={0.24} />
        </div>

        {unreleased.length > 0 && (
          <div className="border border-ember/30 bg-ember/5 p-5" data-testid="unreleased-jobs">
            <p className="font-mono text-[10px] tracking-[0.25em] text-ember mb-3">DRAFT JOBS — NOT YET ON THE FLOOR</p>
            <div className="flex flex-wrap gap-3">
              {unreleased.map((j) => (
                <div key={j.id} className="flex items-center gap-4 border border-white/10 bg-black/40 px-4 py-3">
                  <div>
                    <p className="font-display font-bold">{j.name}</p>
                    <p className="font-mono text-[10px] text-zinc-500">{j.door_count} DOORS · {j.client || "NO CLIENT"}</p>
                  </div>
                  <button
                    data-testid={`release-job-${j.id}`}
                    onClick={() => releaseMut.mutate(j.id)}
                    disabled={releaseMut.isPending}
                    className="h-11 px-5 bg-ember text-black font-display font-extrabold text-sm hover:bg-amber-600 transition-colors disabled:opacity-50"
                  >
                    RELEASE TO FACTORY
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="border border-white/10 bg-carbon">
          <div className="flex flex-wrap items-center gap-3 p-4 border-b border-white/10">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                data-testid="filter-floor-all"
                onClick={() => setFloor("")}
                className={`h-10 px-4 font-mono text-xs tracking-[0.15em] border transition-colors ${!floor ? "bg-ember text-black border-ember font-bold" : "border-white/15 text-zinc-400 hover:border-ember/50"}`}
              >
                ALL FLOORS
              </button>
              {floors.map((f) => (
                <button
                  key={f}
                  data-testid={`filter-floor-${f.replace(/\s+/g, "-").toLowerCase()}`}
                  onClick={() => setFloor(f)}
                  className={`h-10 px-4 font-mono text-xs tracking-[0.15em] border transition-colors ${floor === f ? "bg-ember text-black border-ember font-bold" : "border-white/15 text-zinc-400 hover:border-ember/50"}`}
                >
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="relative ml-auto">
              <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                data-testid="door-search-input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="SEARCH DOOR ID (e.g. RG01.D2)"
                className="h-10 w-64 bg-black/50 border border-white/15 pl-9 pr-3 font-mono text-xs placeholder:text-zinc-600 focus:outline-none focus:border-ember transition-colors"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="tracking-table">
              <thead>
                <tr className="border-b border-white/10">
                  {["DOOR ID", "LOCATION", ...STAGE_COLS.map((c) => c.toUpperCase()), "UPLOADS", ""].map((h) => (
                    <th key={h} className="text-left font-mono text-[10px] tracking-[0.2em] text-zinc-500 px-4 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {doors.map((door) => {
                  const st = stageStatus(door);
                  const canDespatch = st.despatch === "awaiting";
                  return (
                    <tr key={door.id} data-testid={`door-row-${door.door_id}`} className="border-b border-white/5 hover:bg-white/[0.03] transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-ember whitespace-nowrap">{door.door_id}</td>
                      <td className="px-4 py-3 text-zinc-400 text-xs whitespace-nowrap">{door.location}</td>
                      {STAGE_COLS.map((col) => (
                        <td key={col} className="px-4 py-3">
                          <StatusPill status={st[col]} testId={`status-${door.door_id}-${col}`} />
                          {col === "routing" && st.routing === "failed" && door.stages.routing.notes && (
                            <p className="font-mono text-[10px] text-red-400/70 mt-1 max-w-[160px] truncate" title={door.stages.routing.notes}>
                              {door.stages.routing.notes}
                            </p>
                          )}
                        </td>
                      ))}
                      <td className="px-4 py-3">
                        {(door.stages.assembly.photo || door.attach_count > 0) ? (
                          <button
                            data-testid={`uploads-${door.door_id}`}
                            onClick={() => setPhotoDoor(door)}
                            className="font-mono text-[10px] tracking-[0.15em] text-blue-400 border border-blue-500/40 px-2 py-1 hover:bg-blue-500/10 transition-colors"
                          >
                            CLICK HERE{door.attach_count ? ` (${door.attach_count})` : ""}
                          </button>
                        ) : (
                          <span className="font-mono text-[10px] text-zinc-700">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {canDespatch && (
                          <button
                            data-testid={`despatch-${door.door_id}`}
                            onClick={() => despatchMut.mutate(door.door_id)}
                            className="h-9 px-4 bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 font-mono text-[10px] tracking-[0.15em] hover:bg-emerald-500/30 transition-colors whitespace-nowrap"
                          >
                            <CheckCircle size={14} weight="bold" className="inline mr-1 -mt-0.5" /> DESPATCH
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {doors.length === 0 && (
                  <tr><td colSpan={10} className="px-4 py-16 text-center font-mono text-xs text-zinc-600 tracking-[0.2em]">NO DOORS MATCH THIS FILTER</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {photoDoor && <DoorFiles door={photoDoor} onClose={() => setPhotoDoor(null)} />}
    </div>
  );
}
