import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Barcode as BarcodeIcon, Camera, CheckCircle, XCircle, FileText } from "@phosphor-icons/react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { TopNav } from "@/components/TopNav";

export default function Assembly() {
  const qc = useQueryClient();
  const [doorIdInput, setDoorIdInput] = useState("");
  const [door, setDoor] = useState(null);
  const [verified, setVerified] = useState({ core: false, skin: false });
  const [photo, setPhoto] = useState(null);
  const [lookupError, setLookupError] = useState("");
  const fileRef = useRef(null);

  const { data: queue = [] } = useQuery({
    queryKey: ["queue", "assembly"],
    queryFn: () => api.get("/stations/assembly/queue").then((r) => r.data),
    refetchInterval: 5000,
  });
  const readyQueue = queue.filter((d) => d.station_ready);

  const loadDoor = async (id) => {
    setLookupError("");
    setVerified({ core: false, skin: false });
    setPhoto(null);
    try {
      const { data } = await api.get("/doors", { params: { q: id } });
      const exact = data.find((d) => d.door_id.toLowerCase() === id.toLowerCase());
      if (!exact) { setDoor(null); setLookupError(`No door found with ID "${id}"`); return; }
      setDoor(exact);
      setPhoto(exact.stages.assembly.photo || null);
    } catch (e) {
      setLookupError(apiError(e));
    }
  };

  const uploadMut = useMutation({
    mutationFn: (b64) => api.post(`/doors/${encodeURIComponent(door.door_id)}/photo`, { photo: b64 }),
    onSuccess: () => { toast.success("Photo uploaded against " + door.door_id); qc.invalidateQueries(); },
    onError: (e) => toast.error(apiError(e)),
  });

  const completeMut = useMutation({
    mutationFn: () => api.post(`/doors/${encodeURIComponent(door.door_id)}/stations/assembly/complete`),
    onSuccess: () => {
      toast.success(`${door.door_id} assembled — sent to press`);
      setDoor(null); setDoorIdInput(""); setPhoto(null); setVerified({ core: false, skin: false });
      qc.invalidateQueries({ queryKey: ["queue", "assembly"] });
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const onPhoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = reader.result;
      setPhoto(b64);
      uploadMut.mutate(b64);
    };
    reader.readAsDataURL(file);
  };

  const coreDone = door?.stages.core.status === "completed";
  const skinDone = door?.stages.skin.status === "completed";
  const canComplete = door && verified.core && verified.skin && photo && door.stages.assembly.status !== "completed";

  return (
    <div className="min-h-screen bg-obsidian text-white" data-testid="station-assembly">
      <TopNav />
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6 pb-16">
        <div>
          <p className="font-mono text-[10px] tracking-[0.3em] text-ember">STATION 03</p>
          <h1 className="font-display font-black text-5xl tracking-tighter mt-1">Assembly</h1>
        </div>

        <div className="flex gap-3">
          <div className="relative flex-1">
            <BarcodeIcon size={24} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              data-testid="assembly-door-input"
              value={doorIdInput}
              onChange={(e) => setDoorIdInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && loadDoor(doorIdInput.trim())}
              placeholder="SCAN OR TYPE DOOR ID (e.g. RG01.D6)"
              className="w-full h-20 bg-carbon border-2 border-white/15 pl-14 pr-4 font-mono text-2xl font-bold placeholder:text-zinc-600 placeholder:text-base focus:outline-none focus:border-ember transition-colors"
            />
          </div>
          <button data-testid="assembly-load-btn" onClick={() => loadDoor(doorIdInput.trim())}
            className="h-20 px-8 bg-ember text-black font-display font-black text-xl hover:bg-amber-600 transition-colors">
            LOAD
          </button>
        </div>
        {lookupError && <p data-testid="assembly-lookup-error" className="font-mono text-sm text-red-400">{lookupError}</p>}

        {door && (
          <div className="border-2 border-ember/40 bg-carbon p-6 space-y-6" data-testid="assembly-door-panel">
            <div className="flex flex-wrap items-baseline gap-x-6">
              <span className="font-mono font-bold text-4xl text-ember">{door.door_id}</span>
              <span className="font-mono text-sm text-zinc-400">{door.floor} · {door.location} · {door.door_type}</span>
              <a href={`/files?focus=${encodeURIComponent(door.door_id)}`} data-testid="assembly-drawings-btn"
                className="ml-auto font-mono text-xs tracking-[0.2em] text-ember border border-ember/40 px-4 py-2 hover:bg-ember/10 transition-colors flex items-center gap-2">
                <FileText size={16} /> DRAWINGS
              </a>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              {["core", "skin"].map((part) => {
                const done = part === "core" ? coreDone : skinDone;
                const isV = verified[part];
                return (
                  <button
                    key={part}
                    data-testid={`verify-${part}-btn`}
                    disabled={!done || isV}
                    onClick={() => setVerified((v) => ({ ...v, [part]: true }))}
                    className={`h-24 border-2 font-display font-black text-xl flex items-center justify-center gap-3 transition-colors ${
                      isV ? "border-emerald-500 bg-emerald-500/15 text-emerald-400"
                        : done ? "border-white/25 bg-black/40 text-white hover:border-ember"
                        : "border-white/5 bg-black/20 text-zinc-600"
                    }`}
                  >
                    {isV ? <CheckCircle size={28} weight="fill" /> : done ? <BarcodeIcon size={28} /> : <XCircle size={28} />}
                    {isV ? `${part.toUpperCase()} VERIFIED` : done ? `SCAN ${part.toUpperCase()} BARCODE` : `${part.toUpperCase()} NOT READY`}
                  </button>
                );
              })}
            </div>

            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPhoto} data-testid="assembly-photo-input" />
            <div className="grid sm:grid-cols-2 gap-4 items-stretch">
              <button
                data-testid="assembly-photo-btn"
                onClick={() => fileRef.current?.click()}
                className={`h-24 border-2 font-display font-black text-xl flex items-center justify-center gap-3 transition-colors ${
                  photo ? "border-emerald-500 bg-emerald-500/15 text-emerald-400" : "border-white/25 bg-black/40 hover:border-ember"
                }`}
              >
                <Camera size={28} weight="bold" />
                {photo ? "PHOTO CAPTURED" : uploadMut.isPending ? "UPLOADING..." : "TAKE PHOTO"}
              </button>
              {photo && <img src={photo} alt="Assembled door" className="h-24 w-full object-cover border border-white/15" data-testid="assembly-photo-preview" />}
            </div>

            <button
              data-testid="assembly-complete-btn"
              onClick={() => completeMut.mutate()}
              disabled={!canComplete || completeMut.isPending}
              className={`w-full h-24 font-display font-black text-3xl tracking-tight transition-colors ${
                canComplete ? "bg-ember text-black pulse-amber hover:bg-amber-600" : "bg-white/5 text-zinc-600"
              }`}
            >
              {door.stages.assembly.status === "completed" ? "ALREADY ASSEMBLED" : "COMPLETE ASSEMBLY"}
            </button>
          </div>
        )}

        <div data-testid="assembly-ready-list">
          <p className="font-mono text-[10px] tracking-[0.25em] text-zinc-500 mb-3">READY FOR ASSEMBLY ({readyQueue.length})</p>
          <div className="grid sm:grid-cols-2 gap-3">
            {readyQueue.map((d) => (
              <button key={d.id} data-testid={`ready-${d.door_id}`}
                onClick={() => { setDoorIdInput(d.door_id); loadDoor(d.door_id); }}
                className="text-left border border-white/10 bg-carbon hover:border-ember/50 transition-colors p-4 min-h-[72px]">
                <span className="font-mono font-bold text-xl text-ember">{d.door_id}</span>
                <span className="font-mono text-xs text-zinc-500 block mt-1">{d.floor.toUpperCase()} · {d.location}</span>
              </button>
            ))}
            {!readyQueue.length && (
              <p className="font-mono text-xs text-zinc-600 tracking-[0.2em] py-6">NOTHING WAITING — CORES AND SKINS MUST FINISH FIRST</p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
