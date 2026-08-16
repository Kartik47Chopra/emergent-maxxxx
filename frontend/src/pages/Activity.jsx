import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Pulse, CheckCircle, WarningCircle, Truck, UploadSimple, RocketLaunch,
  ArrowsClockwise, SignIn, FileArrowUp, NotePencil, User,
} from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { AppShell } from "@/components/AppShell";
import { timeAgo } from "@/lib/format";

const ACTION_META = {
  stage_completed: [CheckCircle, "text-emerald-400", "completed a stage"],
  qc_pass: [CheckCircle, "text-emerald-400", "passed QC"],
  qc_fail: [WarningCircle, "text-red-400", "failed QC"],
  despatched: [Truck, "text-emerald-300", "despatched"],
  job_released: [RocketLaunch, "text-ember", "released a job"],
  job_imported: [FileArrowUp, "text-blue-400", "imported a job"],
  import_run: [UploadSimple, "text-blue-400", "ran an import"],
  drive_import_started: [UploadSimple, "text-blue-400", "started a Drive import"],
  door_rework: [ArrowsClockwise, "text-amber-400", "sent back for rework"],
  stage_undone: [ArrowsClockwise, "text-amber-400", "reset a stage"],
  note_added: [NotePencil, "text-zinc-300", "added a note"],
  photo_uploaded: [FileArrowUp, "text-blue-300", "uploaded a photo"],
  file_uploaded: [FileArrowUp, "text-blue-300", "uploaded a file"],
  login: [SignIn, "text-zinc-500", "signed in"],
};

const FILTERS = [
  ["", "EVERYTHING"],
  ["stage_completed", "STAGE COMPLETIONS"],
  ["qc_fail", "QC FAILURES"],
  ["despatched", "DESPATCHES"],
  ["file_uploaded", "FILE UPLOADS"],
  ["login", "SIGN-INS"],
];

export default function Activity() {
  const [action, setAction] = useState("");
  const { data: items = [] } = useQuery({
    queryKey: ["activity", action],
    queryFn: () => api.get("/activity", { params: { action: action || undefined, limit: 150 } }).then((r) => r.data),
    refetchInterval: 8000,
  });

  return (
    <AppShell testId="activity-page">
      <main className="max-w-[1000px] mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div>
          <p className="font-mono text-[10px] tracking-[0.3em] text-ember">EVERY ACTION, LOGGED</p>
          <h1 className="font-display font-black text-4xl sm:text-5xl tracking-tighter mt-1">Activity</h1>
          <p className="text-zinc-400 text-sm mt-2">A live record of who did what, when — across the office and every station tablet.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {FILTERS.map(([k, label]) => (
            <button key={k || "all"} data-testid={`activity-filter-${k || "all"}`} onClick={() => setAction(k)}
              className={`h-9 px-3 font-mono text-[10px] tracking-[0.15em] border transition-colors ${action === k ? "bg-ember text-black border-ember font-bold" : "border-white/15 text-zinc-500 hover:border-ember/50"}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="border border-white/10 bg-carbon divide-y divide-white/5" data-testid="activity-feed">
          {items.map((h) => {
            const [Icon, tone, verb] = ACTION_META[h.action] || [Pulse, "text-zinc-400", h.action.replace(/_/g, " ")];
            return (
              <div key={h.id} className="flex items-start gap-3 px-5 py-3.5" data-testid={`activity-${h.id}`}>
                <Icon size={20} className={`${tone} shrink-0 mt-0.5`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm">
                    <span className="font-semibold">{h.user}</span>
                    <span className="text-zinc-400"> {verb}</span>
                    {h.door_id && (
                      <Link to={`/office/doors/${encodeURIComponent(h.door_id)}`} className="font-mono font-bold text-ember hover:underline"> {h.door_id}</Link>
                    )}
                    {h.station && !h.door_id && <span className="font-mono text-zinc-500"> @ {h.station}</span>}
                  </p>
                  {h.detail && <p className="text-xs text-zinc-600 truncate mt-0.5">{h.detail}</p>}
                </div>
                <span className="font-mono text-[10px] text-zinc-600 shrink-0">{timeAgo(h.at)}</span>
              </div>
            );
          })}
          {!items.length && (
            <p className="px-5 py-14 text-center font-mono text-xs text-zinc-600 tracking-[0.2em]" data-testid="activity-empty">
              NOTHING LOGGED YET — ACTIONS WILL SHOW UP HERE AS THE TEAM WORKS
            </p>
          )}
        </div>
      </main>
    </AppShell>
  );
}
