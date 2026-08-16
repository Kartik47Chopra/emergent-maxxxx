const STYLES = {
  completed: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10",
  delivered: "text-emerald-300 border-emerald-400/60 bg-emerald-500/20",
  in_progress: "text-ember border-ember/40 bg-ember/10",
  awaiting: "text-zinc-500 border-white/10 bg-white/[0.03]",
  failed: "text-red-400 border-red-500/50 bg-red-500/10",
  locked: "text-zinc-700 border-white/5 bg-transparent",
};

const LABELS = {
  completed: "COMPLETED",
  delivered: "DELIVERED",
  in_progress: "IN PROGRESS",
  awaiting: "AWAITING",
  failed: "FAILED QC",
  locked: "—",
};

export function stageStatus(door) {
  const s = door.stages;
  const done = (k) => s[k].status === "completed";
  return {
    core: done("core") ? "completed" : "in_progress",
    skin: done("skin") ? "completed" : "in_progress",
    assembly: done("assembly") ? "completed" : done("core") && done("skin") ? "in_progress" : "awaiting",
    press: done("press") ? "completed" : done("assembly") ? "in_progress" : "awaiting",
    routing: s.routing.qc === "fail" ? "failed" : done("routing") ? "completed" : done("press") ? "in_progress" : "awaiting",
    despatch: done("despatch") ? "delivered" : done("routing") && s.routing.qc === "pass" ? "awaiting" : "locked",
  };
}

export function StatusPill({ status, testId }) {
  return (
    <span
      data-testid={testId}
      className={`inline-block font-mono text-[10px] tracking-[0.15em] px-2 py-1 border ${STYLES[status]}`}
    >
      {LABELS[status]}
    </span>
  );
}
