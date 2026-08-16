import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { RocketLaunch, Pause, Trash, Door, Plus, DownloadSimple } from "@phosphor-icons/react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { AppShell } from "@/components/AppShell";

const STAGES = ["core", "skin", "assembly", "press", "routing", "despatch"];

function ProgressBar({ progress }) {
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1.5">
        <span className="font-mono text-[10px] tracking-[0.2em] text-zinc-500">OVERALL PROGRESS</span>
        <span className="font-display font-black text-xl text-ember">{progress.percent}%</span>
      </div>
      <div className="h-2 bg-black/60 border border-white/10">
        <div className="h-full bg-ember transition-all" style={{ width: `${progress.percent}%` }} />
      </div>
      <div className="grid grid-cols-6 gap-1 mt-3">
        {STAGES.map((s) => (
          <div key={s} className="text-center">
            <p className="font-mono text-[9px] text-zinc-600 uppercase">{s.slice(0, 4)}</p>
            <p className="font-mono text-xs font-bold">{progress.per_stage[s]}<span className="text-zinc-600">/{progress.total_doors}</span></p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Jobs() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ["jobs"],
    queryFn: () => api.get("/jobs").then((r) => r.data),
    refetchInterval: 8000,
  });

  const releaseMut = useMutation({
    mutationFn: ({ id, action }) => api.post(`/jobs/${id}/${action}`),
    onSuccess: (_, { action }) => {
      toast.success(action === "release" ? "Released to the factory floor" : "Paused — hidden from the factory tablets");
      qc.invalidateQueries({ queryKey: ["jobs"] });
    },
    onError: (e) => toast.error(apiError(e)),
  });
  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/jobs/${id}`),
    onSuccess: (r) => { toast.success(`Job deleted (${r.data.doors_removed} doors removed)`); qc.invalidateQueries(); },
    onError: (e) => toast.error(apiError(e)),
  });

  return (
    <AppShell testId="jobs-page">
      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8 space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] tracking-[0.3em] text-ember">ONE JOB PER LEVEL</p>
            <h1 className="font-display font-black text-4xl sm:text-5xl tracking-tighter mt-1">Jobs</h1>
            <p className="text-zinc-400 text-sm mt-2 max-w-xl">
              Each level lives here as a job. Release a job when the factory should start on it —
              paused jobs stay hidden from the tablets.
            </p>
          </div>
          <div className="flex gap-3">
            <Link to="/office/import" data-testid="jobs-import-link"
              className="h-12 px-5 bg-ember text-black font-display font-bold flex items-center gap-2 hover:bg-amber-600 transition-colors">
              <DownloadSimple size={18} weight="bold" /> IMPORT SHEETS
            </Link>
            <Link to="/office/jobs/new" data-testid="jobs-manual-link"
              className="h-12 px-5 border border-white/20 font-display font-bold flex items-center gap-2 hover:border-ember hover:text-ember transition-colors">
              <Plus size={18} weight="bold" /> TYPE DOORS IN
            </Link>
          </div>
        </div>

        {isLoading && <p className="font-mono text-xs text-zinc-600 py-8 text-center tracking-[0.2em]">LOADING JOBS…</p>}
        {!isLoading && !jobs.length && (
          <div className="border border-white/10 bg-carbon p-14 text-center" data-testid="jobs-empty">
            <p className="font-display font-bold text-2xl">No jobs yet</p>
            <p className="text-zinc-500 text-sm mt-2">Import your first cutting lists and they'll appear here, one job per level.</p>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-4">
          {jobs.map((j, i) => (
            <motion.div key={j.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.4 }}
              data-testid={`job-card-${j.id}`}
              className="border border-white/10 bg-carbon p-6 space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-display font-extrabold text-xl tracking-tight truncate">{j.name}</h2>
                  <p className="font-mono text-[10px] text-zinc-500 mt-1">
                    {j.door_count} DOORS{j.client ? ` · ${j.client}` : ""}
                  </p>
                </div>
                <span data-testid={`job-status-${j.id}`}
                  className={`font-mono text-[10px] tracking-[0.2em] px-3 py-1.5 border shrink-0 ${
                    j.released ? "text-emerald-400 border-emerald-500/40 bg-emerald-500/10" : "text-zinc-400 border-white/15 bg-white/5"
                  }`}>
                  {j.released ? "ON THE FLOOR" : "DRAFT"}
                </span>
              </div>

              <ProgressBar progress={j.progress} />

              <div className="flex flex-wrap gap-2">
                <button data-testid={`job-doors-${j.id}`}
                  onClick={() => navigate(`/office/doors?job_id=${j.id}`)}
                  className="h-11 px-4 border border-white/15 font-mono text-[11px] tracking-[0.15em] text-zinc-300 hover:text-ember hover:border-ember transition-colors flex items-center gap-2">
                  <Door size={16} weight="bold" /> VIEW DOORS
                </button>
                {j.released ? (
                  <button data-testid={`job-pause-${j.id}`}
                    onClick={() => releaseMut.mutate({ id: j.id, action: "unrelease" })}
                    className="h-11 px-4 border border-amber-500/40 text-amber-400 font-mono text-[11px] tracking-[0.15em] hover:bg-amber-500/10 transition-colors flex items-center gap-2">
                    <Pause size={16} weight="bold" /> PAUSE
                  </button>
                ) : (
                  <button data-testid={`job-release-${j.id}`}
                    onClick={() => releaseMut.mutate({ id: j.id, action: "release" })}
                    className="h-11 px-4 bg-ember text-black font-display font-bold text-sm hover:bg-amber-600 transition-colors flex items-center gap-2">
                    <RocketLaunch size={16} weight="bold" /> RELEASE
                  </button>
                )}
                <button data-testid={`job-delete-${j.id}`}
                  onClick={() => window.confirm(`Delete "${j.name}" and all ${j.door_count} of its doors? This can't be undone.`) && deleteMut.mutate(j.id)}
                  className="h-11 px-4 border border-white/15 text-zinc-500 hover:text-red-400 hover:border-red-500/50 transition-colors ml-auto">
                  <Trash size={16} weight="bold" />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      </main>
    </AppShell>
  );
}
