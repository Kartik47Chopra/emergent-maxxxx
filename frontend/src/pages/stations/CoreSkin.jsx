import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Sticker, FileText } from "@phosphor-icons/react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { TopNav } from "@/components/TopNav";
import { LabelModal } from "@/components/LabelModal";

export default function CoreSkin({ mode }) {
  const qc = useQueryClient();
  const isCore = mode === "core";
  const [selected, setSelected] = useState({});
  const [labelDoor, setLabelDoor] = useState(null);
  const [floor, setFloor] = useState("");

  const { data: queue = [], isLoading } = useQuery({
    queryKey: ["queue", mode],
    queryFn: () => api.get(`/stations/${mode}/queue`).then((r) => r.data),
    refetchInterval: 5000,
  });

  const completeMut = useMutation({
    mutationFn: (doorIds) => api.post("/doors/batch-complete", { station: mode, door_ids: doorIds }),
    onSuccess: (r) => {
      const n = r.data.completed.length;
      if (n) toast.success(`${n} ${isCore ? "core" : "skin"} item${n > 1 ? "s" : ""} completed`);
      r.data.errors.forEach((e) => toast.error(e));
      setSelected({});
      qc.invalidateQueries({ queryKey: ["queue", mode] });
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const floors = [...new Set(queue.map((d) => d.floor))].sort();
  const visible = queue
    .filter((d) => !floor || d.floor === floor)
    .sort((a, b) => a.floor.localeCompare(b.floor) || a.door_id.localeCompare(b.door_id));
  const selectedIds = Object.keys(selected).filter((k) => selected[k]);

  return (
    <div className="min-h-screen bg-obsidian text-white" data-testid={`station-${mode}`}>
      <TopNav />
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6 pb-40">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] tracking-[0.3em] text-ember">{isCore ? "STATION 01" : "STATION 02"}</p>
            <h1 className="font-display font-black text-5xl tracking-tighter mt-1">{isCore ? "Core Cutting" : "Skin Cutting"}</h1>
          </div>
          <div className="flex gap-2">
            <button data-testid="floor-filter-all" onClick={() => setFloor("")}
              className={`h-12 px-5 font-mono text-xs tracking-[0.15em] border ${!floor ? "bg-ember text-black border-ember font-bold" : "border-white/15 text-zinc-400"}`}>
              ALL
            </button>
            {floors.map((f) => (
              <button key={f} data-testid={`floor-filter-${f.replace(/\s+/g, "-").toLowerCase()}`} onClick={() => setFloor(f)}
                className={`h-12 px-5 font-mono text-xs tracking-[0.15em] border ${floor === f ? "bg-ember text-black border-ember font-bold" : "border-white/15 text-zinc-400"}`}>
                {f.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {isLoading && <p className="font-mono text-sm text-zinc-500 tracking-[0.2em]" data-testid="queue-loading">LOADING QUEUE...</p>}
        {!isLoading && visible.length === 0 && (
          <div className="border border-emerald-500/30 bg-emerald-500/5 p-10 text-center" data-testid="queue-empty">
            <p className="font-display font-black text-3xl text-emerald-400 tracking-tight">QUEUE CLEAR</p>
            <p className="font-mono text-xs text-zinc-500 mt-2 tracking-[0.2em]">ALL {isCore ? "CORES" : "SKINS"} COMPLETE FOR RELEASED JOBS</p>
          </div>
        )}

        <div className="space-y-3" data-testid="cutting-list">
          {visible.map((door) => {
            const isSel = !!selected[door.door_id];
            return (
              <button
                key={door.id}
                data-testid={`tick-${door.door_id}`}
                onClick={() => setSelected((s) => ({ ...s, [door.door_id]: !s[door.door_id] }))}
                className={`w-full text-left border-2 transition-colors flex items-center gap-5 p-5 min-h-[96px] ${
                  isSel ? "border-ember bg-ember/10" : "border-white/10 bg-carbon hover:border-white/30"
                }`}
              >
                <div className={`w-12 h-12 shrink-0 border-2 flex items-center justify-center transition-colors ${
                  isSel ? "bg-ember border-ember" : "border-white/25"
                }`}>
                  {isSel && <Check size={28} weight="bold" className="text-black" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-4">
                    <span className="font-mono font-bold text-2xl text-ember">{door.door_id}</span>
                    <span className="font-mono text-xs text-zinc-500">{door.floor.toUpperCase()} · {door.location}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1 mt-2 font-mono text-sm">
                    <span className="text-zinc-400">QTY <b className="text-white">{isCore ? door.core_qty : door.skin_qty}</b></span>
                    <span className="text-zinc-400 col-span-2 sm:col-span-1 truncate">CUT <b className="text-white">{isCore ? door.core_cutting : door.skin_cutting}</b></span>
                    <span className="text-zinc-400 truncate hidden sm:block">TYPE <b className="text-white">{isCore ? door.core_type : door.skin_type}</b></span>
                    <span className="text-zinc-400 hidden sm:block">FIRE <b className="text-white">{door.fire_rating}</b></span>
                  </div>
                </div>
                <a
                  href={`/files?focus=${encodeURIComponent(door.door_id)}`}
                  data-testid={`drawings-${door.door_id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="shrink-0 w-12 h-12 border border-white/15 flex items-center justify-center text-zinc-500 hover:text-ember hover:border-ember transition-colors"
                  title="Drawings & files"
                >
                  <FileText size={22} />
                </a>
              </button>
            );
          })}
        </div>
      </main>

      <div className="fixed bottom-0 inset-x-0 bg-obsidian/95 backdrop-blur border-t border-white/10 p-4">
        <div className="max-w-5xl mx-auto flex gap-3">
          <button
            data-testid="complete-batch-btn"
            onClick={() => completeMut.mutate(selectedIds)}
            disabled={!selectedIds.length || completeMut.isPending}
            className={`flex-1 h-20 font-display font-black text-2xl tracking-tight transition-colors ${
              selectedIds.length ? "bg-ember text-black pulse-amber hover:bg-amber-600" : "bg-white/5 text-zinc-600"
            }`}
          >
            {selectedIds.length ? `COMPLETE BATCH (${selectedIds.length})` : "TICK ITEMS TO COMPLETE"}
          </button>
          <button
            data-testid="print-stickers-btn"
            onClick={() => {
              const done = queue.find((d) => selected[d.door_id]);
              if (done) setLabelDoor(done);
              else toast.info("Tick a line item first — sticker prints after completion");
            }}
            className="h-20 px-6 border border-white/20 font-display font-bold flex items-center gap-2 hover:border-ember hover:text-ember transition-colors"
          >
            <Sticker size={24} weight="bold" /> STICKER
          </button>
        </div>
      </div>

      {labelDoor && <LabelModal door={labelDoor} title={`${mode.toUpperCase()} ID STICKER`} onClose={() => setLabelDoor(null)} />}
    </div>
  );
}
