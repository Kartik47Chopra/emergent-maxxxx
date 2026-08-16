import { useState, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FilePdf, File as FileIcon, DownloadSimple, Trash, UploadSimple, FolderOpen } from "@phosphor-icons/react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { TopNav } from "@/components/TopNav";
import { openFile } from "@/components/DoorFiles";

export default function Files() {
  const qc = useQueryClient();
  const fileRef = useRef(null);
  const [params] = useSearchParams();
  const [doorId, setDoorId] = useState("");
  const [floor, setFloor] = useState("");
  const [search, setSearch] = useState(params.get("focus") || "");

  const { data: files = [], isLoading } = useQuery({
    queryKey: ["files", "all"],
    queryFn: () => api.get("/files").then((r) => r.data),
    refetchInterval: 8000,
  });

  const uploadMut = useMutation({
    mutationFn: (file) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("door_id", doorId.trim());
      fd.append("floor", floor.trim());
      return api.post("/files", fd);
    },
    onSuccess: () => { toast.success("File uploaded"); setDoorId(""); qc.invalidateQueries({ queryKey: ["files"] }); },
    onError: (e) => toast.error(apiError(e)),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/files/${id}`),
    onSuccess: () => { toast.success("File deleted"); qc.invalidateQueries({ queryKey: ["files"] }); },
    onError: (e) => toast.error(apiError(e)),
  });

  const visible = files.filter((f) => {
    const q = search.toLowerCase();
    return !q || f.original_filename.toLowerCase().includes(q) || (f.door_id || "").toLowerCase().includes(q) || (f.floor || "").toLowerCase().includes(q);
  });

  return (
    <div className="min-h-screen bg-obsidian text-white" data-testid="files-page">
      <TopNav />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        <div>
          <p className="font-mono text-[10px] tracking-[0.3em] text-ember">SHARED DOCUMENT VAULT</p>
          <h1 className="font-display font-black text-4xl sm:text-5xl tracking-tighter mt-1">Drawings &amp; Files</h1>
          <p className="text-zinc-400 text-sm mt-2">Shop drawings and data sheets. Anyone on the team can upload from anywhere — attach to a Door ID or floor, or leave unassigned.</p>
        </div>

        <div className="border border-white/10 bg-carbon p-5 space-y-4" data-testid="upload-panel">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="file-door-id" className="font-mono text-[10px] tracking-[0.25em] text-zinc-500 block mb-2">LINK TO DOOR ID (OPTIONAL)</label>
              <input id="file-door-id" data-testid="file-door-id-input" value={doorId} onChange={(e) => setDoorId(e.target.value)}
                placeholder="e.g. R1801.D3"
                className="w-full h-12 bg-black/50 border border-white/15 px-4 font-mono text-sm focus:outline-none focus:border-ember transition-colors" />
            </div>
            <div>
              <label htmlFor="file-floor" className="font-mono text-[10px] tracking-[0.25em] text-zinc-500 block mb-2">FLOOR / LEVEL (OPTIONAL)</label>
              <input id="file-floor" data-testid="file-floor-input" value={floor} onChange={(e) => setFloor(e.target.value)}
                placeholder="e.g. LEVEL 18"
                className="w-full h-12 bg-black/50 border border-white/15 px-4 font-mono text-sm focus:outline-none focus:border-ember transition-colors" />
            </div>
          </div>
          <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.csv,.txt" className="hidden" data-testid="file-input"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadMut.mutate(f); e.target.value = ""; }} />
          <button data-testid="file-upload-btn" onClick={() => fileRef.current?.click()} disabled={uploadMut.isPending}
            className="w-full h-16 bg-ember text-black font-display font-black text-xl flex items-center justify-center gap-3 hover:bg-amber-600 transition-colors disabled:opacity-50">
            <UploadSimple size={24} weight="bold" /> {uploadMut.isPending ? "UPLOADING..." : "CHOOSE FILE & UPLOAD"}
          </button>
        </div>

        <div className="border border-white/10 bg-carbon">
          <div className="flex items-center gap-3 p-4 border-b border-white/10">
            <FolderOpen size={20} className="text-ember" />
            <p className="font-mono text-xs tracking-[0.25em] text-zinc-400">ALL FILES ({files.length})</p>
            <input data-testid="files-search-input" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="FILTER BY NAME / DOOR / FLOOR"
              className="ml-auto h-10 w-64 bg-black/50 border border-white/15 px-3 font-mono text-xs placeholder:text-zinc-600 focus:outline-none focus:border-ember transition-colors" />
          </div>
          {isLoading && <p className="font-mono text-xs text-zinc-600 p-6">LOADING...</p>}
          {!isLoading && !visible.length && (
            <p className="font-mono text-xs text-zinc-600 tracking-[0.2em] p-10 text-center" data-testid="files-empty">NO FILES YET — UPLOAD THE FIRST DRAWING ABOVE</p>
          )}
          <div className="divide-y divide-white/5">
            {visible.map((f) => (
              <div key={f.id} data-testid={`file-row-${f.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors">
                {f.content_type === "application/pdf" ? <FilePdf size={24} className="text-red-400 shrink-0" /> : <FileIcon size={24} className="text-zinc-400 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{f.original_filename}</p>
                  <p className="font-mono text-[10px] text-zinc-500">
                    {(f.size / 1024).toFixed(0)} KB · {f.uploaded_by} · {new Date(f.created_at).toLocaleDateString()}
                    {f.door_id && <> · <span className="text-ember">{f.door_id}</span></>}
                    {f.floor && <> · {f.floor}</>}
                  </p>
                </div>
                <button data-testid={`file-open-${f.id}`} onClick={() => openFile(f)}
                  className="h-10 w-10 border border-white/15 flex items-center justify-center text-zinc-300 hover:text-ember hover:border-ember transition-colors shrink-0">
                  <DownloadSimple size={18} weight="bold" />
                </button>
                <button data-testid={`file-delete-${f.id}`} onClick={() => deleteMut.mutate(f.id)}
                  className="h-10 w-10 border border-white/15 flex items-center justify-center text-zinc-300 hover:text-red-400 hover:border-red-500 transition-colors shrink-0">
                  <Trash size={18} weight="bold" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
