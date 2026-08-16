import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sticker } from "@phosphor-icons/react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { TopNav } from "@/components/TopNav";
import { LabelModal } from "@/components/LabelModal";

export default function Press() {
  const qc = useQueryClient();
  const [labelDoor, setLabelDoor] = useState(null);

  const { data: queue = [], isLoading } = useQuery({
    queryKey: ["queue", "press"],
    queryFn: () => api.get("/stations/press/queue").then((r) => r.data),
    refetchInterval: 5000,
  });
  const ready = queue.filter((d) => d.station_ready);

  const completeMut = useMutation({
    mutationFn: (door) => api.post(`/doors/${encodeURIComponent(door.door_id)}/stations/press/complete`),
    onSuccess: (_, door) => {
      toast.success(`${door.door_id} pressed — label ready`);
      setLabelDoor(door);
      qc.invalidateQueries({ queryKey: ["queue", "press"] });
    },
    onError: (e) => toast.error(apiError(e)),
  });

  return (
    <div className="min-h-screen bg-obsidian text-white" data-testid="station-press">
      <TopNav />
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div>
          <p className="font-mono text-[10px] tracking-[0.3em] text-ember">STATION 04</p>
          <h1 className="font-display font-black text-5xl tracking-tighter mt-1">Press</h1>
        </div>

        {isLoading && <p className="font-mono text-sm text-zinc-500 tracking-[0.2em]">LOADING QUEUE...</p>}
        {!isLoading && !ready.length && (
          <div className="border border-emerald-500/30 bg-emerald-500/5 p-10 text-center" data-testid="press-empty">
            <p className="font-display font-black text-3xl text-emerald-400 tracking-tight">PRESS QUEUE CLEAR</p>
            <p className="font-mono text-xs text-zinc-500 mt-2 tracking-[0.2em]">WAITING ON ASSEMBLY</p>
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-4" data-testid="press-queue">
          {ready.map((door) => (
            <div key={door.id} className="border-2 border-white/10 bg-carbon p-5" data-testid={`press-card-${door.door_id}`}>
              <div className="flex items-baseline justify-between flex-wrap gap-2">
                <span className="font-mono font-bold text-3xl text-ember">{door.door_id}</span>
                <span className="font-mono text-xs text-zinc-500">{door.floor.toUpperCase()}</span>
              </div>
              <div className="font-mono text-sm text-zinc-400 mt-2 space-y-1">
                <p>LEAF <b className="text-white">{door.leaf_height} × {door.leaf_width_1}{door.leaf_width_2 ? ` × ${door.leaf_width_2}` : ""}</b></p>
                <p>FINISH <b className="text-white">{door.panel_finish}</b> · <b className="text-white">{door.fire_rating}</b></p>
              </div>
              <button
                data-testid={`press-complete-${door.door_id}`}
                onClick={() => completeMut.mutate(door)}
                disabled={completeMut.isPending}
                className="w-full h-20 mt-4 bg-ember text-black font-display font-black text-2xl tracking-tight hover:bg-amber-600 active:translate-y-px transition-colors disabled:opacity-50 flex items-center justify-center gap-3"
              >
                <Sticker size={26} weight="bold" /> PRESS COMPLETE
              </button>
            </div>
          ))}
        </div>
      </main>

      {labelDoor && <LabelModal door={labelDoor} title="PRESS LABEL" onClose={() => setLabelDoor(null)} />}
    </div>
  );
}
