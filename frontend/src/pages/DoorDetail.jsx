import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ArrowLeft, Printer, CheckCircle, Circle, Truck, ArrowsClockwise,
  ArrowCounterClockwise, FolderOpen, ChatText, X, WarningCircle,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { AppShell } from "@/components/AppShell";
import { LabelModal } from "@/components/LabelModal";
import { Barcode } from "@/components/Barcode";
import { DoorFiles } from "@/components/DoorFiles";
import { fmtDateTime, timeAgo } from "@/lib/format";

const STAGE_META = [
  ["core", "Core cut", "Core panels cut to size"],
  ["skin", "Skin cut", "Door skins cut to size"],
  ["assembly", "Assembled", "Core + skins glued up, photo taken"],
  ["press", "Pressed", "Through the press, sticker on"],
  ["routing", "Routed & QC", "Trimmed to size, quality checked"],
  ["despatch", "Despatched", "On the truck to site"],
];

const SPEC_SECTIONS = [
  ["DIMENSIONS", [["leaf_height", "Leaf height"], ["leaf_width_1", "Leaf width 1"], ["leaf_width_2", "Leaf width 2"], ["panel_thickness", "Panel thickness"], ["actual_thickness", "Actual thickness"], ["qty", "Quantity"]]],
  ["BUILD", [["leaf_type", "Single / pair"], ["handing", "Handing"], ["door_schedule_type", "Schedule type"], ["door_type", "Door type"], ["panel_finish", "Panel finish"], ["fire_rating", "Fire rating"], ["internal_door", "Internal door"]]],
  ["FRAME & HARDWARE", [["frame_type", "Frame type"], ["hinge_qty", "Hinge qty"], ["cladding", "Cladding"], ["strike_prep", "Strike prep"], ["frame_strike_height", "Strike height (SFL)"], ["door_seal_prep", "Door seal prep"], ["conduit", "Conduit (elec lock)"]]],
  ["VISION PANEL & GRILLE", [["vision_panel", "Vision panel"], ["vision_panel_type", "VP type"], ["vp_size", "VP size"], ["grille_cutout", "Grille cutout"], ["grille_size", "Grille size"]]],
  ["CORE CUTTING", [["core_type", "Core type"], ["core_qty_1", "Qty — leaf 1"], ["core_cutting_1", "Cutting — leaf 1"], ["core_qty_2", "Qty — leaf 2"], ["core_cutting_2", "Cutting — leaf 2"]]],
  ["SKIN CUTTING", [["skin_type", "Skin type"], ["skin_qty_1", "Qty — leaf 1"], ["skin_cutting_1", "Cutting — leaf 1"], ["skin_qty_2", "Qty — leaf 2"], ["skin_cutting_2", "Cutting — leaf 2"]]],
  ["STILES & RAILS", [["stile_qty", "Stile qty"], ["stiles", "Stile size"], ["rail_qty_1", "Rail qty — leaf 1"], ["rail_1", "Rail size — leaf 1"], ["rail_qty_2", "Rail qty — leaf 2"], ["rail_2", "Rail size — leaf 2"]]],
];

function ReworkModal({ door, onClose }) {
  const qc = useQueryClient();
  const [picked, setPicked] = useState([]);
  const [reason, setReason] = useState("");
  const mut = useMutation({
    mutationFn: () => api.post(`/doors/${encodeURIComponent(door.door_id)}/rework`, { stations: picked, reason }),
    onSuccess: () => { toast.success(`${door.door_id} sent back for rework`); qc.invalidateQueries(); onClose(); },
    onError: (e) => toast.error(apiError(e)),
  });
  const toggle = (s) => setPicked((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]));
  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4" data-testid="rework-modal">
      <div className="w-full max-w-md border border-white/15 bg-carbon p-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="font-mono text-xs tracking-[0.25em] text-amber-400">SEND BACK FOR REWORK</p>
          <button onClick={onClose} data-testid="rework-close-btn" className="text-zinc-400 hover:text-white"><X size={20} weight="bold" /></button>
        </div>
        <p className="text-sm text-zinc-400">Pick which stages need redoing. Everything after them resets automatically.</p>
        <div className="space-y-2">
          {STAGE_META.slice(0, 5).map(([key, label]) => (
            <label key={key} className="flex items-center gap-3 border border-white/10 bg-black/40 px-4 py-3 cursor-pointer hover:border-ember/40 transition-colors">
              <input type="checkbox" data-testid={`rework-stage-${key}`} checked={picked.includes(key)} onChange={() => toggle(key)}
                className="w-5 h-5 accent-amber-500" />
              <span className="font-semibold text-sm">{label}</span>
            </label>
          ))}
        </div>
        <textarea data-testid="rework-reason-input" value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder="Why is it going back? (required)" rows={3}
          className="w-full bg-black/50 border border-white/15 p-3 text-sm placeholder:text-zinc-600 focus:outline-none focus:border-amber-500 transition-colors" />
        <button data-testid="rework-submit-btn" onClick={() => mut.mutate()}
          disabled={!picked.length || !reason.trim() || mut.isPending}
          className="w-full h-14 bg-amber-500 text-black font-display font-extrabold flex items-center justify-center gap-2 hover:bg-amber-400 transition-colors disabled:opacity-40">
          <ArrowsClockwise size={20} weight="bold" /> {mut.isPending ? "SENDING BACK…" : "CONFIRM REWORK"}
        </button>
      </div>
    </div>
  );
}

export default function DoorDetail() {
  const { doorId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [sticker, setSticker] = useState(false);
  const [filesOpen, setFilesOpen] = useState(false);
  const [rework, setRework] = useState(false);
  const [note, setNote] = useState("");

  const { data: door, isLoading, error } = useQuery({
    queryKey: ["door", doorId],
    queryFn: () => api.get(`/doors/${encodeURIComponent(doorId)}`).then((r) => r.data),
    refetchInterval: 8000,
  });
  const { data: history = [] } = useQuery({
    queryKey: ["door-history", doorId],
    queryFn: () => api.get(`/doors/${encodeURIComponent(doorId)}/history`).then((r) => r.data),
    refetchInterval: 15000,
  });

  const despatchMut = useMutation({
    mutationFn: () => api.post(`/doors/${encodeURIComponent(doorId)}/despatch`),
    onSuccess: () => { toast.success(`${doorId} despatched`); qc.invalidateQueries(); },
    onError: (e) => toast.error(apiError(e)),
  });
  const undoMut = useMutation({
    mutationFn: (station) => api.post(`/doors/${encodeURIComponent(doorId)}/stations/${station}/undo`),
    onSuccess: () => { toast.success("Stage reset"); qc.invalidateQueries(); },
    onError: (e) => toast.error(apiError(e)),
  });
  const noteMut = useMutation({
    mutationFn: () => api.post(`/doors/${encodeURIComponent(doorId)}/notes`, { text: note }),
    onSuccess: () => { setNote(""); toast.success("Note added"); qc.invalidateQueries({ queryKey: ["door", doorId] }); },
    onError: (e) => toast.error(apiError(e)),
  });

  if (error) {
    return (
      <AppShell testId="door-detail-page">
        <main className="max-w-3xl mx-auto px-6 py-20 text-center">
          <p className="font-display font-black text-3xl">Door not found</p>
          <Link to="/office/doors" className="inline-block mt-4 text-ember font-mono text-xs tracking-[0.2em]">← BACK TO ALL DOORS</Link>
        </main>
      </AppShell>
    );
  }
  if (isLoading || !door) {
    return (
      <AppShell testId="door-detail-page">
        <main className="max-w-3xl mx-auto px-6 py-20 text-center font-mono text-xs text-zinc-500 tracking-[0.3em]">LOADING DOOR…</main>
      </AppShell>
    );
  }

  const stages = door.stages;
  const canDespatch = stages.routing.qc === "pass" && stages.despatch.status !== "completed";
  const qcFailed = stages.routing.qc === "fail";

  return (
    <AppShell testId="door-detail-page">
      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8 space-y-8">
        <button data-testid="door-back-btn" onClick={() => navigate(-1)}
          className="flex items-center gap-2 font-mono text-xs tracking-[0.2em] text-zinc-400 hover:text-ember transition-colors">
          <ArrowLeft size={16} weight="bold" /> BACK
        </button>

        <div className="grid lg:grid-cols-[1fr_380px] gap-6 items-start">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <div>
              <p className="font-mono text-[10px] tracking-[0.3em] text-ember">{door.floor} · {door.location}</p>
              <h1 className="font-display font-black text-5xl sm:text-6xl tracking-tighter mt-1" data-testid="door-detail-id">{door.door_id}</h1>
              <p className="font-mono text-xs text-zinc-500 mt-2">{door.job_name}</p>
              {qcFailed && (
                <div className="mt-3 border border-red-500/40 bg-red-500/10 px-4 py-3 flex items-start gap-2" data-testid="door-qc-fail-banner">
                  <WarningCircle size={18} className="text-red-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-300">Failed QC: {stages.routing.notes || "no notes"}</p>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-3">
              <button data-testid="door-print-sticker-btn" onClick={() => setSticker(true)}
                className="h-14 px-7 bg-ember text-black font-display font-extrabold text-lg flex items-center gap-2 hover:bg-amber-600 transition-colors">
                <Printer size={22} weight="bold" /> PRINT STICKER
              </button>
              <button data-testid="door-files-btn" onClick={() => setFilesOpen(true)}
                className="h-14 px-6 border border-white/20 font-display font-bold flex items-center gap-2 hover:border-ember hover:text-ember transition-colors">
                <FolderOpen size={20} weight="bold" /> DRAWINGS ({door.attach_count || 0})
              </button>
              {canDespatch && (
                <button data-testid="door-despatch-btn" onClick={() => despatchMut.mutate()} disabled={despatchMut.isPending}
                  className="h-14 px-6 bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 font-display font-bold flex items-center gap-2 hover:bg-emerald-500/30 transition-colors disabled:opacity-50">
                  <Truck size={20} weight="bold" /> DESPATCH NOW
                </button>
              )}
              {user?.role === "office" && (
                <button data-testid="door-rework-btn" onClick={() => setRework(true)}
                  className="h-14 px-6 border border-amber-500/40 text-amber-400 font-display font-bold flex items-center gap-2 hover:bg-amber-500/10 transition-colors">
                  <ArrowsClockwise size={20} weight="bold" /> REWORK
                </button>
              )}
            </div>

            <div className="border border-white/10 bg-white p-5" data-testid="door-barcode-card">
              <Barcode value={door.door_id} height={64} scale={2} />
              <p className="font-mono text-center text-black text-xs tracking-[0.5em] mt-1">{door.door_id}</p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              {SPEC_SECTIONS.map(([title, rows]) => (
                <div key={title} className="border border-white/10 bg-carbon p-5" data-testid={`spec-${title.toLowerCase().replace(/[^a-z]+/g, "-")}`}>
                  <p className="font-mono text-[10px] tracking-[0.3em] text-ember mb-3">{title}</p>
                  <div className="space-y-1.5">
                    {rows.map(([key, label]) => (
                      <div key={key} className="flex justify-between gap-4 text-sm">
                        <span className="text-zinc-500">{label}</span>
                        <span className={`font-mono text-right ${door[key] ? "text-white" : "text-zinc-700"}`}>{door[key] || "—"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {Object.keys(door.extras || {}).length > 0 && (
                <div className="border border-white/10 bg-carbon p-5" data-testid="spec-extras">
                  <p className="font-mono text-[10px] tracking-[0.3em] text-ember mb-3">EXTRA COLUMNS FROM THE SHEETS</p>
                  <div className="space-y-1.5">
                    {Object.entries(door.extras).map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-4 text-sm">
                        <span className="text-zinc-500 capitalize">{k}</span>
                        <span className="font-mono text-right">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {stages.assembly.photo && (
              <div className="border border-white/10 bg-carbon p-5">
                <p className="font-mono text-[10px] tracking-[0.3em] text-ember mb-3">ASSEMBLY PHOTO</p>
                <img src={stages.assembly.photo} alt={`Assembly of ${door.door_id}`}
                  className="w-full max-h-80 object-contain bg-black border border-white/10" data-testid="door-assembly-photo" />
              </div>
            )}
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="space-y-6">
            <div className="border border-white/10 bg-carbon p-5" data-testid="door-timeline">
              <p className="font-mono text-[10px] tracking-[0.3em] text-ember mb-4">PRODUCTION TIMELINE</p>
              <div className="space-y-0">
                {STAGE_META.map(([key, label, hint], i) => {
                  const st = stages[key];
                  const done = st.status === "completed";
                  const failed = key === "routing" && stages.routing.qc === "fail";
                  return (
                    <div key={key} className="flex gap-3 relative" data-testid={`timeline-${key}`}>
                      {i < STAGE_META.length - 1 && (
                        <span className={`absolute left-[11px] top-7 bottom-0 w-0.5 ${done ? "bg-emerald-500/40" : "bg-white/10"}`} />
                      )}
                      <div className="shrink-0 mt-0.5">
                        {failed ? <WarningCircle size={24} weight="fill" className="text-red-500" />
                          : done ? <CheckCircle size={24} weight="fill" className="text-emerald-400" />
                          : <Circle size={24} className="text-zinc-700" />}
                      </div>
                      <div className="pb-6 flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={`font-display font-bold ${done ? "text-white" : failed ? "text-red-400" : "text-zinc-500"}`}>{label}</p>
                          {done && user?.role === "office" && key !== "despatch" && (
                            <button data-testid={`timeline-undo-${key}`} title={`Reset ${label}`}
                              onClick={() => undoMut.mutate(key)}
                              className="text-zinc-600 hover:text-amber-400 transition-colors">
                              <ArrowCounterClockwise size={14} weight="bold" />
                            </button>
                          )}
                        </div>
                        {done || failed ? (
                          <p className="font-mono text-[10px] text-zinc-400 mt-0.5">{st.by} · {fmtDateTime(st.at)}</p>
                        ) : (
                          <p className="font-mono text-[10px] text-zinc-500 mt-0.5">{hint}</p>
                        )}
                        {failed && stages.routing.notes && (
                          <p className="text-xs text-red-400/80 mt-1">{stages.routing.notes}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="border border-white/10 bg-carbon p-5" data-testid="door-notes">
              <p className="font-mono text-[10px] tracking-[0.3em] text-ember mb-3">NOTES ({(door.notes || []).length})</p>
              <div className="space-y-2 mb-3 max-h-56 overflow-y-auto">
                {(door.notes || []).slice().reverse().map((n) => (
                  <div key={n.id} className="border border-white/10 bg-black/40 px-3 py-2">
                    <p className="text-sm">{n.text}</p>
                    <p className="font-mono text-[10px] text-zinc-600 mt-1">{n.by} · {timeAgo(n.at)}</p>
                  </div>
                ))}
                {!(door.notes || []).length && <p className="font-mono text-[10px] text-zinc-600 tracking-[0.15em]">NO NOTES YET</p>}
              </div>
              <div className="flex gap-2">
                <input data-testid="door-note-input" value={note} onChange={(e) => setNote(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && note.trim() && noteMut.mutate()}
                  placeholder="Write a note for the team…"
                  className="flex-1 h-11 bg-black/50 border border-white/15 px-3 text-sm placeholder:text-zinc-600 focus:outline-none focus:border-ember transition-colors" />
                <button data-testid="door-note-add-btn" onClick={() => noteMut.mutate()} disabled={!note.trim() || noteMut.isPending}
                  className="h-11 px-4 bg-ember text-black font-display font-bold text-sm disabled:opacity-40 hover:bg-amber-600 transition-colors">
                  <ChatText size={18} weight="bold" />
                </button>
              </div>
            </div>

            {(door.rework_log || []).length > 0 && (
              <div className="border border-amber-500/30 bg-amber-500/5 p-5" data-testid="door-rework-log">
                <p className="font-mono text-[10px] tracking-[0.3em] text-amber-400 mb-3">REWORK HISTORY</p>
                {(door.rework_log || []).slice().reverse().map((r) => (
                  <div key={r.id} className="text-sm mb-2">
                    <p className="text-amber-300">{r.stations.join(", ")} — {r.reason}</p>
                    <p className="font-mono text-[10px] text-zinc-600">{r.by} · {timeAgo(r.at)}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="border border-white/10 bg-carbon p-5" data-testid="door-history">
              <p className="font-mono text-[10px] tracking-[0.3em] text-ember mb-3">HISTORY</p>
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {history.map((h) => (
                  <div key={h.id} className="text-xs flex gap-2">
                    <span className="font-mono text-zinc-600 shrink-0">{timeAgo(h.at)}</span>
                    <span className="text-zinc-400 truncate">{h.user} — {h.action.replace(/_/g, " ")}{h.detail ? `: ${h.detail}` : ""}</span>
                  </div>
                ))}
                {!history.length && <p className="font-mono text-[10px] text-zinc-600 tracking-[0.15em]">NO ACTIVITY RECORDED YET</p>}
              </div>
            </div>
          </motion.div>
        </div>
      </main>

      {sticker && <LabelModal door={door} onClose={() => setSticker(false)} />}
      {filesOpen && <DoorFiles door={door} onClose={() => setFilesOpen(false)} />}
      {rework && <ReworkModal door={door} onClose={() => setRework(false)} />}
    </AppShell>
  );
}
