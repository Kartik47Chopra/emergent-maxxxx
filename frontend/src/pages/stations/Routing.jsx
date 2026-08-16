import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, XCircle, FileText, Ruler } from "@phosphor-icons/react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { TopNav } from "@/components/TopNav";
import { LabelModal } from "@/components/LabelModal";

export default function Routing() {
  const qc = useQueryClient();
  const [door, setDoor] = useState(null);
  const [notes, setNotes] = useState("");
  const [failing, setFailing] = useState(false);
  const [labelDoor, setLabelDoor] = useState(null);
  const [note, setNote] = useState(null);

  const { data: queue = [], isLoading } = useQuery({
    queryKey: ["queue", "routing"],
    queryFn: () => api.get("/stations/routing/queue").then((r) => r.data),
    refetchInterval: 5000,
  });
  const ready = queue.filter((d) => d.station_ready);

  const qcMut = useMutation({
    mutationFn: ({ id, result, notes }) => api.post(`/doors/${encodeURIComponent(id)}/routing/qc`, { result, notes }),
    onSuccess: (r, vars) => {
      if (vars.result === "pass") {
        toast.success(`${vars.id} passed QC — final barcode ready`);
        setLabelDoor(r.data);
      } else {
        toast.error(`${vars.id} FAILED QC — sent back with notes`);
      }
      setDoor(null); setNotes(""); setFailing(false);
      qc.invalidateQueries({ queryKey: ["queue", "routing"] });
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const noteMut = useMutation({
    mutationFn: (floor) => api.get("/despatch-note", { params: { floor } }).then((r) => r.data),
    onSuccess: (data) => setNote(data),
    onError: (e) => toast.error(apiError(e)),
  });

  return (
    <div className="min-h-screen bg-obsidian text-white" data-testid="station-routing">
      <TopNav />
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] tracking-[0.3em] text-ember">STATION 05</p>
            <h1 className="font-display font-black text-5xl tracking-tighter mt-1">Routing / QC</h1>
          </div>
        </div>

        {isLoading && <p className="font-mono text-sm text-zinc-500 tracking-[0.2em]">LOADING QUEUE...</p>}
        {!isLoading && !ready.length && !door && (
          <div className="border border-emerald-500/30 bg-emerald-500/5 p-10 text-center" data-testid="routing-empty">
            <p className="font-display font-black text-3xl text-emerald-400 tracking-tight">ROUTING QUEUE CLEAR</p>
            <p className="font-mono text-xs text-zinc-500 mt-2 tracking-[0.2em]">WAITING ON PRESS</p>
          </div>
        )}

        {!door && (
          <div className="space-y-3" data-testid="routing-queue">
            {ready.map((d) => (
              <button key={d.id} data-testid={`routing-select-${d.door_id}`} onClick={() => setDoor(d)}
                className="w-full text-left border-2 border-white/10 bg-carbon hover:border-ember transition-colors p-5 min-h-[88px] flex items-center justify-between gap-4">
                <div>
                  <span className="font-mono font-bold text-2xl text-ember">{d.door_id}</span>
                  <span className="font-mono text-xs text-zinc-500 block mt-1">{d.floor.toUpperCase()} · {d.location}</span>
                </div>
                <Ruler size={28} className="text-zinc-600 shrink-0" />
              </button>
            ))}
          </div>
        )}

        {door && (
          <div className="border-2 border-ember/40 bg-carbon p-6 space-y-6" data-testid="routing-qc-panel">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <span className="font-mono font-bold text-4xl text-ember">{door.door_id}</span>
              <a href={`/files?focus=${encodeURIComponent(door.door_id)}`} data-testid="routing-drawings-btn"
                className="font-mono text-xs tracking-[0.2em] text-ember border border-ember/40 px-4 py-2 hover:bg-ember/10 transition-colors">
                DRAWINGS
              </a>
              <button data-testid="routing-back-btn" onClick={() => { setDoor(null); setFailing(false); setNotes(""); }}
                className="font-mono text-xs tracking-[0.2em] text-zinc-400 hover:text-white border border-white/15 px-4 py-2 transition-colors">
                ← BACK TO QUEUE
              </button>
            </div>

            <div className="border border-white/10 bg-black/40 p-5" data-testid="routing-dimensions">
              <p className="font-mono text-[10px] tracking-[0.25em] text-zinc-500 mb-3">VERIFY DIMENSIONS</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-3 font-mono text-lg">
                <span className="text-zinc-400">HEIGHT <b className="text-white block text-2xl">{door.leaf_height}</b></span>
                <span className="text-zinc-400">WIDTH 1 <b className="text-white block text-2xl">{door.leaf_width_1}</b></span>
                <span className="text-zinc-400">WIDTH 2 <b className="text-white block text-2xl">{door.leaf_width_2 || "—"}</b></span>
                <span className="text-zinc-400">PANEL <b className="text-white block text-2xl">{door.panel_thickness}mm</b></span>
                <span className="text-zinc-400">ACTUAL <b className="text-white block text-2xl">{door.actual_thickness}mm</b></span>
                <span className="text-zinc-400">FIRE <b className="text-white block text-2xl">{door.fire_rating}</b></span>
              </div>
            </div>

            {!failing ? (
              <div className="grid sm:grid-cols-2 gap-4">
                <button
                  data-testid="qc-pass-btn"
                  onClick={() => qcMut.mutate({ id: door.door_id, result: "pass", notes: "" })}
                  disabled={qcMut.isPending}
                  className="h-28 bg-emerald-500 text-black font-display font-black text-3xl tracking-tight flex items-center justify-center gap-3 hover:bg-emerald-400 active:translate-y-px transition-colors disabled:opacity-50"
                >
                  <CheckCircle size={36} weight="fill" /> QC PASS
                </button>
                <button
                  data-testid="qc-fail-btn"
                  onClick={() => setFailing(true)}
                  className="h-28 bg-red-500/90 text-black font-display font-black text-3xl tracking-tight flex items-center justify-center gap-3 hover:bg-red-500 active:translate-y-px transition-colors"
                >
                  <XCircle size={36} weight="fill" /> QC FAIL
                </button>
              </div>
            ) : (
              <div className="space-y-4 border-2 border-red-500/50 bg-red-500/5 p-5" data-testid="qc-fail-form">
                <label htmlFor="qc-notes" className="font-mono text-[10px] tracking-[0.25em] text-red-400 block">WHY DID THIS DOOR FAIL QC? (REQUIRED)</label>
                <textarea
                  id="qc-notes"
                  data-testid="qc-notes-input"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="e.g. Veneer bubble on top rail, 12mm from edge"
                  className="w-full bg-black/50 border border-white/15 p-4 font-mono text-base focus:outline-none focus:border-red-500 transition-colors"
                />
                <div className="grid grid-cols-2 gap-4">
                  <button data-testid="qc-fail-cancel-btn" onClick={() => { setFailing(false); setNotes(""); }}
                    className="h-16 border border-white/20 font-display font-bold text-lg hover:bg-white/10 transition-colors">
                    CANCEL
                  </button>
                  <button
                    data-testid="qc-fail-submit-btn"
                    onClick={() => qcMut.mutate({ id: door.door_id, result: "fail", notes })}
                    disabled={!notes.trim() || qcMut.isPending}
                    className="h-16 bg-red-500 text-black font-display font-black text-xl hover:bg-red-400 transition-colors disabled:opacity-40"
                  >
                    CONFIRM FAIL
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="border border-white/10 bg-carbon p-5" data-testid="despatch-note-section">
          <p className="font-mono text-[10px] tracking-[0.25em] text-zinc-500 mb-3">DESPATCH NOTE — DOORS READY FOR DELIVERY BY FLOOR</p>
          <div className="flex flex-wrap gap-3">
            {[...new Set(ready.map((d) => d.floor))].concat(note ? [] : []).map((f) => (
              <button key={f} data-testid={`despatch-note-${f.replace(/\s+/g, "-").toLowerCase()}`} onClick={() => noteMut.mutate(f)}
                className="h-14 px-6 border border-white/20 font-display font-bold flex items-center gap-2 hover:border-ember hover:text-ember transition-colors">
                <FileText size={20} weight="bold" /> {f.toUpperCase()}
              </button>
            ))}
            {[...new Set(queue.map((d) => d.floor))].length === 0 && (
              <button data-testid="despatch-note-ground" onClick={() => noteMut.mutate("Ground Floor")}
                className="h-14 px-6 border border-white/20 font-display font-bold flex items-center gap-2 hover:border-ember hover:text-ember transition-colors">
                <FileText size={20} weight="bold" /> GROUND FLOOR
              </button>
            )}
          </div>
        </div>
      </main>

      {labelDoor && <LabelModal door={labelDoor} title="FINAL DESPATCH BARCODE" onClose={() => setLabelDoor(null)} />}
      {note && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-6" data-testid="despatch-note-modal">
          <div className="max-w-xl w-full">
            <div className="print-area bg-white text-black p-8">
              <p className="font-mono text-[10px] tracking-[0.3em] text-zinc-500">MAXX DOORS / DESPATCH NOTE</p>
              <p className="font-display font-black text-3xl tracking-tighter mt-1">{note.floor}</p>
              <p className="font-mono text-xs text-zinc-500 mt-1">Generated {new Date(note.generated_at).toLocaleString()}</p>
              <table className="w-full mt-6 text-sm font-mono">
                <thead>
                  <tr className="border-b-2 border-black text-left">
                    <th className="py-2">DOOR ID</th><th>LOCATION</th><th className="text-right">FIRE</th>
                  </tr>
                </thead>
                <tbody>
                  {note.doors.map((d) => (
                    <tr key={d.id} className="border-b border-zinc-300">
                      <td className="py-2 font-bold">{d.door_id}</td><td>{d.location}</td><td className="text-right">{d.fire_rating}</td>
                    </tr>
                  ))}
                  {!note.doors.length && <tr><td colSpan={3} className="py-6 text-center text-zinc-500">NO DOORS READY FOR DESPATCH ON THIS FLOOR</td></tr>}
                </tbody>
              </table>
              <p className="font-mono text-[10px] text-zinc-500 mt-6">SIGNATURE: ______________________</p>
            </div>
            <div className="flex gap-3 mt-4 print:hidden">
              <button data-testid="despatch-note-print-btn" onClick={() => window.print()}
                className="flex-1 h-14 bg-ember text-black font-display font-extrabold hover:bg-amber-600 transition-colors">PRINT NOTE</button>
              <button data-testid="despatch-note-close-btn" onClick={() => setNote(null)}
                className="h-14 px-6 border border-white/20 font-display font-bold hover:bg-white/10 transition-colors">CLOSE</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
