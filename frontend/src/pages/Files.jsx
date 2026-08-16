import { useState, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { FilePdf, FileXls, FileImage, File as FileIcon, DownloadSimple, Trash, CloudArrowUp, CheckCircle, FolderOpen, Smiley } from "@phosphor-icons/react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { AppShell } from "@/components/AppShell";
import { openFile } from "@/components/DoorFiles";

function kindOf(f) {
  const ct = f.content_type || "";
  if (ct.includes("pdf")) return "pdf";
  if (ct.includes("image")) return "image";
  if (ct.includes("sheet") || ct.includes("excel") || ct.includes("csv") || /\.(xlsx|xls|csv)$/i.test(f.original_filename)) return "sheet";
  return "other";
}

const KIND_META = {
  pdf: { icon: FilePdf, cls: "text-red-400 bg-red-500/10 border-red-500/30", label: "PDF" },
  image: { icon: FileImage, cls: "text-blue-400 bg-blue-500/10 border-blue-500/30", label: "IMAGE" },
  sheet: { icon: FileXls, cls: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30", label: "SHEET" },
  other: { icon: FileIcon, cls: "text-zinc-400 bg-white/5 border-white/15", label: "FILE" },
};

const CHIPS = [["all", "ALL FILES"], ["pdf", "PDFS"], ["image", "IMAGES"], ["sheet", "SPREADSHEETS"]];

export default function Files() {
  const qc = useQueryClient();
  const fileRef = useRef(null);
  const [params] = useSearchParams();
  const [doorId, setDoorId] = useState("");
  const [floor, setFloor] = useState("");
  const [search, setSearch] = useState(params.get("focus") || "");
  const [chip, setChip] = useState("all");
  const [dragging, setDragging] = useState(false);
  const [queue, setQueue] = useState([]);

  const { data: files = [], isLoading } = useQuery({
    queryKey: ["files", "all"],
    queryFn: () => api.get("/files").then((r) => r.data),
    refetchInterval: 8000,
  });

  const uploadFiles = async (list) => {
    const items = [...list].map((f) => ({ name: f.name, status: "uploading" }));
    setQueue((q) => [...q, ...items]);
    for (const file of list) {
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("door_id", doorId.trim());
        fd.append("floor", floor.trim());
        await api.post("/files", fd);
        setQueue((q) => q.map((i) => (i.name === file.name ? { ...i, status: "done" } : i)));
        toast.success(`${file.name} uploaded`);
      } catch (e) {
        setQueue((q) => q.map((i) => (i.name === file.name ? { ...i, status: "error" } : i)));
        toast.error(apiError(e, `Could not upload ${file.name}`));
      }
    }
    setDoorId("");
    qc.invalidateQueries({ queryKey: ["files"] });
    setTimeout(() => setQueue([]), 2500);
  };

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/files/${id}`),
    onSuccess: () => { toast.success("File removed"); qc.invalidateQueries({ queryKey: ["files"] }); },
    onError: (e) => toast.error(apiError(e)),
  });

  const visible = files.filter((f) => {
    if (chip !== "all" && kindOf(f) !== chip) return false;
    const q = search.toLowerCase();
    return !q || f.original_filename.toLowerCase().includes(q) || (f.door_id || "").toLowerCase().includes(q) || (f.floor || "").toLowerCase().includes(q);
  });

  return (
    <AppShell testId="files-page">
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <p className="font-mono text-[10px] tracking-[0.3em] text-ember">SHARED DOCUMENT VAULT</p>
          <h1 className="font-display font-black text-4xl sm:text-5xl tracking-tighter mt-1">Drawings &amp; Files</h1>
          <p className="text-zinc-400 text-sm mt-2 max-w-xl">
            Everyone's shared folder for shop drawings and data sheets. Drop files in from the office,
            the factory floor, or home — link them to a door or level so the tablets can find them instantly.
          </p>
        </motion.div>

        <div
          data-testid="upload-dropzone"
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); uploadFiles(e.dataTransfer.files); }}
          className={`border-2 border-dashed p-10 text-center transition-colors ${
            dragging ? "border-ember bg-ember/10" : "border-white/20 bg-carbon hover:border-ember/50"
          }`}
        >
          <CloudArrowUp size={52} weight="duotone" className={`mx-auto mb-3 transition-colors ${dragging ? "text-ember" : "text-zinc-500"}`} />
          <p className="font-display font-extrabold text-2xl tracking-tight">
            {dragging ? "Drop them right here" : "Drag & drop your files here"}
          </p>
          <p className="font-mono text-[11px] tracking-[0.15em] text-zinc-500 mt-2">PDFS · PHOTOS · EXCEL — AS MANY AS YOU LIKE, UP TO 25MB EACH</p>
          <div className="grid sm:grid-cols-2 gap-3 max-w-lg mx-auto mt-6">
            <input data-testid="file-door-id-input" value={doorId} onChange={(e) => setDoorId(e.target.value)}
              placeholder="Link to door (optional) e.g. R1601.D3" aria-label="Link to door"
              className="h-12 bg-black/50 border border-white/15 px-4 font-mono text-xs placeholder:text-zinc-600 focus:outline-none focus:border-ember transition-colors" />
            <input data-testid="file-floor-input" value={floor} onChange={(e) => setFloor(e.target.value)}
              placeholder="Level (optional) e.g. LEVEL 16" aria-label="Floor or level"
              className="h-12 bg-black/50 border border-white/15 px-4 font-mono text-xs placeholder:text-zinc-600 focus:outline-none focus:border-ember transition-colors" />
          </div>
          <input ref={fileRef} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.csv,.txt" className="hidden" data-testid="file-input"
            onChange={(e) => { uploadFiles(e.target.files); e.target.value = ""; }} />
          <button data-testid="file-upload-btn" onClick={() => fileRef.current?.click()}
            className="mt-6 h-14 px-10 bg-ember text-black font-display font-black text-lg hover:bg-amber-600 active:translate-y-px transition-colors">
            OR BROWSE FILES
          </button>
          <AnimatePresence>
            {queue.length > 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-4 space-y-1 max-w-lg mx-auto" data-testid="upload-queue">
                {queue.map((i) => (
                  <p key={i.name} className="font-mono text-xs flex items-center gap-2 justify-center">
                    {i.status === "done" ? <CheckCircle size={14} className="text-emerald-400" weight="fill" />
                      : i.status === "error" ? <Trash size={14} className="text-red-400" />
                      : <span className="w-3 h-3 border-2 border-ember border-t-transparent rounded-full animate-spin" />}
                    <span className={i.status === "error" ? "text-red-400" : "text-zinc-400"}>{i.name}</span>
                  </p>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <FolderOpen size={20} className="text-ember" />
            <p className="font-mono text-xs tracking-[0.25em] text-zinc-400 mr-2">{files.length} FILE{files.length === 1 ? "" : "S"}</p>
            {CHIPS.map(([k, label]) => (
              <button key={k} data-testid={`chip-${k}`} onClick={() => setChip(k)}
                className={`h-9 px-4 font-mono text-[10px] tracking-[0.15em] border transition-colors ${
                  chip === k ? "bg-ember text-black border-ember font-bold" : "border-white/15 text-zinc-400 hover:border-ember/50"
                }`}>
                {label}
              </button>
            ))}
            <input data-testid="files-search-input" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="SEARCH NAME, DOOR OR LEVEL..."
              className="ml-auto h-9 w-56 bg-black/50 border border-white/15 px-3 font-mono text-[11px] placeholder:text-zinc-600 focus:outline-none focus:border-ember transition-colors" />
          </div>

          {isLoading && <p className="font-mono text-xs text-zinc-600 py-8 text-center">LOADING FILES...</p>}
          {!isLoading && !visible.length && (
            <div className="border border-white/10 bg-carbon p-12 text-center" data-testid="files-empty">
              <Smiley size={40} className="text-zinc-600 mx-auto mb-3" />
              <p className="font-display font-bold text-xl">Nothing here yet</p>
              <p className="font-mono text-xs text-zinc-500 mt-2 tracking-[0.1em]">DROP YOUR FIRST DRAWING IN THE BOX ABOVE — IT TAKES TWO SECONDS</p>
            </div>
          )}
          <div className="grid sm:grid-cols-2 gap-3">
            {visible.map((f) => {
              const meta = KIND_META[kindOf(f)];
              const Icon = meta.icon;
              return (
                <motion.div key={f.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  data-testid={`file-row-${f.id}`}
                  className="border border-white/10 bg-carbon hover:border-white/25 transition-colors p-4 flex gap-4 group">
                  <div className={`w-12 h-12 shrink-0 border flex items-center justify-center ${meta.cls}`}>
                    <Icon size={24} weight="duotone" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate group-hover:text-ember transition-colors">{f.original_filename}</p>
                    <p className="font-mono text-[10px] text-zinc-500 mt-1">
                      {(f.size / 1024).toFixed(0)} KB · {f.uploaded_by} · {new Date(f.created_at).toLocaleDateString()}
                    </p>
                    <div className="flex gap-2 mt-2">
                      {f.door_id && <span className="font-mono text-[9px] tracking-[0.1em] text-ember border border-ember/40 bg-ember/10 px-2 py-0.5">{f.door_id}</span>}
                      {f.floor && <span className="font-mono text-[9px] tracking-[0.1em] text-blue-400 border border-blue-500/40 bg-blue-500/10 px-2 py-0.5">{f.floor}</span>}
                      <span className="font-mono text-[9px] tracking-[0.1em] text-zinc-500 border border-white/10 px-2 py-0.5">{meta.label}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    <button data-testid={`file-open-${f.id}`} onClick={() => openFile(f)} title="Open"
                      className="h-10 w-10 border border-white/15 flex items-center justify-center text-zinc-300 hover:text-ember hover:border-ember transition-colors">
                      <DownloadSimple size={18} weight="bold" />
                    </button>
                    <button data-testid={`file-delete-${f.id}`} onClick={() => deleteMut.mutate(f.id)} title="Delete"
                      className="h-10 w-10 border border-white/15 flex items-center justify-center text-zinc-300 hover:text-red-400 hover:border-red-500 transition-colors">
                      <Trash size={18} weight="bold" />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </main>
    </AppShell>
  );
}
