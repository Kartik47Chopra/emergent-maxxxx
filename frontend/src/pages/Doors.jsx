import { useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { MagnifyingGlass, Barcode as BarcodeIcon, CaretRight } from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { AppShell } from "@/components/AppShell";
import { LabelModal } from "@/components/LabelModal";
import { stageStatus } from "@/components/StatusPill";

const STAGES = ["core", "skin", "assembly", "press", "routing", "despatch"];
const STATUS_CHIPS = [
  ["", "ALL"],
  ["in_production", "IN PRODUCTION"],
  ["awaiting_despatch", "READY TO SHIP"],
  ["delivered", "DELIVERED"],
  ["qc_failed", "FAILED QC"],
];

const DOT = {
  completed: "bg-emerald-400", delivered: "bg-emerald-300", in_progress: "bg-ember",
  awaiting: "bg-zinc-700", failed: "bg-red-500", locked: "bg-zinc-800",
};

export function StageDots({ door }) {
  const st = stageStatus(door);
  return (
    <div className="flex items-center gap-1.5" title={STAGES.map((s) => `${s}: ${st[s]}`).join(", ")}>
      {STAGES.map((s) => (
        <span key={s} className={`w-2.5 h-2.5 rounded-full ${DOT[st[s]]}`} />
      ))}
    </div>
  );
}

export default function Doors() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [sticker, setSticker] = useState(null);
  const floor = params.get("floor") || "";
  const status = params.get("status") || "";
  const jobId = params.get("job_id") || "";

  const { data: floors = [] } = useQuery({
    queryKey: ["floors"],
    queryFn: () => api.get("/doors/floors").then((r) => r.data),
  });
  const { data: doors = [], isLoading } = useQuery({
    queryKey: ["doors", floor, status, jobId, search],
    queryFn: () => api.get("/doors", {
      params: { floor: floor || undefined, status: status || undefined, job_id: jobId || undefined, q: search || undefined },
    }).then((r) => r.data),
    refetchInterval: 8000,
  });

  const setParam = (k, v) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next, { replace: true });
  };

  const totals = useMemo(() => floors.reduce((a, f) => a + f.total, 0), [floors]);

  return (
    <AppShell testId="doors-page">
      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div>
          <p className="font-mono text-[10px] tracking-[0.3em] text-ember">EVERY DOOR IN THE SYSTEM</p>
          <h1 className="font-display font-black text-4xl sm:text-5xl tracking-tighter mt-1">Doors</h1>
          <p className="text-zinc-400 text-sm mt-2">
            Tap any door to open its full page — specs, barcode sticker, drawings and history.
            {totals ? ` Tracking ${totals} doors right now.` : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button data-testid="doors-floor-all" onClick={() => setParam("floor", "")}
            className={`h-10 px-4 font-mono text-xs tracking-[0.15em] border transition-colors ${!floor ? "bg-ember text-black border-ember font-bold" : "border-white/15 text-zinc-400 hover:border-ember/50"}`}>
            ALL LEVELS
          </button>
          {floors.map((f) => (
            <button key={f.floor} data-testid={`doors-floor-${f.floor.replace(/\s+/g, "-").toLowerCase()}`}
              onClick={() => setParam("floor", f.floor)}
              className={`h-10 px-4 font-mono text-xs tracking-[0.15em] border transition-colors ${floor === f.floor ? "bg-ember text-black border-ember font-bold" : "border-white/15 text-zinc-400 hover:border-ember/50"}`}>
              {f.floor.toUpperCase()} <span className="opacity-60">({f.total})</span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {STATUS_CHIPS.map(([k, label]) => (
            <button key={k || "all"} data-testid={`doors-status-${k || "all"}`} onClick={() => setParam("status", k)}
              className={`h-9 px-3 font-mono text-[10px] tracking-[0.15em] border transition-colors ${status === k ? "bg-white text-black border-white font-bold" : "border-white/15 text-zinc-500 hover:border-white/40"}`}>
              {label}
            </button>
          ))}
          <div className="relative ml-auto">
            <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input data-testid="doors-search-input" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="DOOR ID OR LOCATION…"
              className="h-10 w-64 bg-black/50 border border-white/15 pl-9 pr-3 font-mono text-xs placeholder:text-zinc-600 focus:outline-none focus:border-ember transition-colors" />
          </div>
        </div>

        <div className="border border-white/10 bg-carbon overflow-x-auto">
          <table className="w-full text-sm" data-testid="doors-table">
            <thead>
              <tr className="border-b border-white/10">
                {["DOOR ID", "LEVEL", "LOCATION", "SIZE (H × W)", "FIRE", "PROGRESS", "STICKER", ""].map((h) => (
                  <th key={h} className="text-left font-mono text-[10px] tracking-[0.2em] text-zinc-500 px-4 py-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {doors.map((d) => (
                <tr key={d.id} data-testid={`doors-row-${d.door_id}`}
                  onClick={() => navigate(`/office/doors/${encodeURIComponent(d.door_id)}`)}
                  className="border-b border-white/5 hover:bg-white/[0.04] transition-colors cursor-pointer">
                  <td className="px-4 py-3 font-mono font-bold text-ember whitespace-nowrap">{d.door_id}</td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-400 whitespace-nowrap">{d.floor}</td>
                  <td className="px-4 py-3 text-xs text-zinc-300 whitespace-nowrap">{d.location}</td>
                  <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">
                    {d.leaf_height} × {d.leaf_width_1}{d.leaf_width_2 ? ` + ${d.leaf_width_2}` : ""}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-400">{d.fire_rating || "—"}</td>
                  <td className="px-4 py-3"><StageDots door={d} /></td>
                  <td className="px-4 py-3">
                    <button data-testid={`doors-sticker-${d.door_id}`}
                      onClick={(e) => { e.stopPropagation(); setSticker(d); }}
                      className="h-9 px-3 border border-white/15 text-zinc-300 hover:text-ember hover:border-ember font-mono text-[10px] tracking-[0.15em] transition-colors flex items-center gap-1.5">
                      <BarcodeIcon size={14} weight="bold" /> STICKER
                    </button>
                  </td>
                  <td className="px-4 py-3 text-zinc-600"><CaretRight size={16} /></td>
                </tr>
              ))}
              {!isLoading && doors.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-16 text-center font-mono text-xs text-zinc-600 tracking-[0.2em]">NO DOORS MATCH — TRY CLEARING THE FILTERS</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
      {sticker && <LabelModal door={sticker} onClose={() => setSticker(null)} />}
    </AppShell>
  );
}
