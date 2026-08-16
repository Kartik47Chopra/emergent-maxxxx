import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FilePdf, File as FileIcon, DownloadSimple, Trash, UploadSimple, X } from "@phosphor-icons/react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";

export async function openFile(file) {
  try {
    const res = await api.get(`/files/${file.id}/download`, { responseType: "blob" });
    const url = URL.createObjectURL(new Blob([res.data], { type: file.content_type || "application/octet-stream" }));
    window.open(url, "_blank");
  } catch (e) {
    toast.error(apiError(e, "Could not open file"));
  }
}

export function DoorFiles({ door, onClose }) {
  const qc = useQueryClient();
  const fileRef = useRef(null);

  const { data: files = [], isLoading } = useQuery({
    queryKey: ["files", door.door_id],
    queryFn: () => api.get("/files", { params: { door_id: door.door_id } }).then((r) => r.data),
  });

  const uploadMut = useMutation({
    mutationFn: (file) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("door_id", door.door_id);
      fd.append("job_id", door.job_id || "");
      fd.append("floor", door.floor || "");
      return api.post("/files", fd);
    },
    onSuccess: () => { toast.success("Drawing attached to " + door.door_id); qc.invalidateQueries({ queryKey: ["files"] }); qc.invalidateQueries({ queryKey: ["doors"] }); },
    onError: (e) => toast.error(apiError(e)),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/files/${id}`),
    onSuccess: () => { toast.success("File deleted"); qc.invalidateQueries({ queryKey: ["files"] }); qc.invalidateQueries({ queryKey: ["doors"] }); },
    onError: (e) => toast.error(apiError(e)),
  });

  const photo = door.stages?.assembly?.photo;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4" data-testid="door-files-modal">
      <div className="w-full max-w-2xl border border-white/15 bg-carbon max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
          <p className="font-mono text-xs tracking-[0.25em] text-ember">DRAWINGS &amp; UPLOADS — <span className="text-white font-bold">{door.door_id}</span></p>
          <button data-testid="door-files-close-btn" onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">
            <X size={22} weight="bold" />
          </button>
        </div>
        <div className="overflow-y-auto p-5 space-y-4">
          {photo && (
            <div>
              <p className="font-mono text-[10px] tracking-[0.25em] text-zinc-500 mb-2">ASSEMBLY PHOTO</p>
              <img src={photo} alt={`Assembly of ${door.door_id}`} className="w-full max-h-64 object-contain bg-black border border-white/10" data-testid="door-assembly-photo" />
            </div>
          )}
          <div>
            <p className="font-mono text-[10px] tracking-[0.25em] text-zinc-500 mb-2">ATTACHED FILES ({files.length})</p>
            {isLoading && <p className="font-mono text-xs text-zinc-600">LOADING...</p>}
            {!isLoading && !files.length && (
              <p className="font-mono text-xs text-zinc-600 tracking-[0.15em] py-4" data-testid="door-files-empty">NO FILES ATTACHED YET</p>
            )}
            <div className="space-y-2">
              {files.map((f) => (
                <div key={f.id} data-testid={`door-file-${f.id}`} className="flex items-center gap-3 border border-white/10 bg-black/40 px-4 py-3">
                  {f.content_type === "application/pdf" ? <FilePdf size={22} className="text-red-400 shrink-0" /> : <FileIcon size={22} className="text-zinc-400 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{f.original_filename}</p>
                    <p className="font-mono text-[10px] text-zinc-500">{(f.size / 1024).toFixed(0)} KB · {f.uploaded_by} · {new Date(f.created_at).toLocaleDateString()}</p>
                  </div>
                  <button data-testid={`door-file-open-${f.id}`} onClick={() => openFile(f)}
                    className="h-10 w-10 border border-white/15 flex items-center justify-center text-zinc-300 hover:text-ember hover:border-ember transition-colors shrink-0">
                    <DownloadSimple size={18} weight="bold" />
                  </button>
                  <button data-testid={`door-file-delete-${f.id}`} onClick={() => deleteMut.mutate(f.id)}
                    className="h-10 w-10 border border-white/15 flex items-center justify-center text-zinc-300 hover:text-red-400 hover:border-red-500 transition-colors shrink-0">
                    <Trash size={18} weight="bold" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="border-t border-white/10 p-4 shrink-0"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) uploadMut.mutate(f); }}>
          <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.csv,.txt" className="hidden"
            data-testid="door-file-input"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadMut.mutate(f); e.target.value = ""; }} />
          <button data-testid="door-file-upload-btn" onClick={() => fileRef.current?.click()} disabled={uploadMut.isPending}
            className="w-full h-14 bg-ember text-black font-display font-extrabold flex items-center justify-center gap-2 hover:bg-amber-600 active:translate-y-px transition-colors disabled:opacity-50">
            <UploadSimple size={20} weight="bold" /> {uploadMut.isPending ? "UPLOADING..." : "ATTACH A DRAWING — OR DROP IT HERE"}
          </button>
          <p className="font-mono text-[10px] text-zinc-600 text-center mt-2 tracking-[0.1em]">PDFS AND PHOTOS SHOW UP FOR EVERYONE STRAIGHT AWAY</p>
        </div>
      </div>
    </div>
  );
}
