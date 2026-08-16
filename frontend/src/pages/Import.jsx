import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { FileXls, Trash, CheckCircle, ArrowLeft } from "@phosphor-icons/react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { TopNav } from "@/components/TopNav";

export default function Import() {
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [name, setName] = useState("");
  const [client, setClient] = useState("");

  const previewMut = useMutation({
    mutationFn: (file) => {
      const fd = new FormData();
      fd.append("file", file);
      return api.post("/import/preview", fd);
    },
    onSuccess: (r) => {
      setPreview(r.data);
      setName(r.data.job_name);
      toast.success(`Parsed ${r.data.count} doors — review below`);
    },
    onError: (e) => toast.error(apiError(e, "Could not parse that file")),
  });

  const confirmMut = useMutation({
    mutationFn: () => api.post("/import/confirm", { name, client, doors: preview.doors }),
    onSuccess: (r) => {
      toast.success(`Job "${r.data.name}" imported with ${r.data.door_count} doors (draft — release when ready)`);
      navigate("/office");
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const removeRow = (i) => setPreview((p) => ({ ...p, doors: p.doors.filter((_, j) => j !== i), count: p.count - 1 }));

  return (
    <div className="min-h-screen bg-obsidian text-white" data-testid="import-page">
      <TopNav />
      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8 space-y-8">
        <div>
          <p className="font-mono text-[10px] tracking-[0.3em] text-ember">BULK JOB IMPORT</p>
          <h1 className="font-display font-black text-4xl sm:text-5xl tracking-tighter mt-1">Import Cutting Lists</h1>
          <p className="text-zinc-400 text-sm mt-2 max-w-2xl">
            Drop your Assembly sheet, Core Cutting List or Rail Cutting List Excel files — one per level.
            The system reads the door rows automatically and builds the job. Repeat for each of your levels.
          </p>
        </div>

        {!preview && (
          <div className="border-2 border-dashed border-white/20 bg-carbon p-16 text-center" data-testid="import-dropzone">
            <FileXls size={56} className="text-ember mx-auto mb-4" weight="duotone" />
            <p className="font-display font-bold text-2xl">Drop in an .xlsx cutting list</p>
            <p className="font-mono text-xs text-zinc-500 mt-2 tracking-[0.15em]">ASSEMBLY SHEET · CORE CUTTING LIST · RAIL CUTTING LIST</p>
            <input ref={fileRef} type="file" accept=".xlsx" className="hidden" data-testid="import-file-input"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) previewMut.mutate(f); e.target.value = ""; }} />
            <button data-testid="import-choose-btn" onClick={() => fileRef.current?.click()} disabled={previewMut.isPending}
              className="mt-8 h-16 px-10 bg-ember text-black font-display font-black text-xl hover:bg-amber-600 transition-colors disabled:opacity-50">
              {previewMut.isPending ? "READING FILE..." : "CHOOSE EXCEL FILE"}
            </button>
          </div>
        )}

        {preview && (
          <>
            <div className="flex flex-wrap items-center gap-4">
              <button data-testid="import-back-btn" onClick={() => setPreview(null)}
                className="h-12 px-5 border border-white/20 font-display font-bold flex items-center gap-2 hover:border-ember hover:text-ember transition-colors">
                <ArrowLeft size={18} weight="bold" /> NEW FILE
              </button>
              <div className="flex-1 min-w-[200px]">
                <label htmlFor="import-job-name" className="font-mono text-[10px] tracking-[0.25em] text-zinc-500 block mb-1">JOB NAME</label>
                <input id="import-job-name" data-testid="import-job-name-input" value={name} onChange={(e) => setName(e.target.value)}
                  className="w-full h-12 bg-carbon border border-white/15 px-4 font-display font-bold focus:outline-none focus:border-ember transition-colors" />
              </div>
              <div className="flex-1 min-w-[200px]">
                <label htmlFor="import-client" className="font-mono text-[10px] tracking-[0.25em] text-zinc-500 block mb-1">CLIENT</label>
                <input id="import-client" data-testid="import-client-input" value={client} onChange={(e) => setClient(e.target.value)}
                  placeholder="Optional"
                  className="w-full h-12 bg-carbon border border-white/15 px-4 focus:outline-none focus:border-ember transition-colors" />
              </div>
            </div>

            <div className="border border-white/10 bg-carbon overflow-x-auto">
              <table className="w-full text-sm" data-testid="import-preview-table">
                <thead>
                  <tr className="border-b border-white/10">
                    {["DOOR ID", "FLOOR", "LOCATION", "TYPE", "HEIGHT", "W1", "W2", "CORE CUTTING", ""].map((h) => (
                      <th key={h} className="text-left font-mono text-[10px] tracking-[0.2em] text-zinc-500 px-4 py-3 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.doors.map((d, i) => (
                    <tr key={i} data-testid={`import-row-${d.door_id || i}`} className="border-b border-white/5 hover:bg-white/[0.03]">
                      <td className="px-4 py-2 font-mono font-bold text-ember whitespace-nowrap">{d.door_id}</td>
                      <td className="px-4 py-2 font-mono text-xs text-zinc-400 whitespace-nowrap">{d.floor || "—"}</td>
                      <td className="px-4 py-2 text-xs text-zinc-300 whitespace-nowrap">{d.location || "—"}</td>
                      <td className="px-4 py-2 font-mono text-xs text-zinc-400">{d.door_type || "—"}</td>
                      <td className="px-4 py-2 font-mono text-xs">{d.leaf_height || "—"}</td>
                      <td className="px-4 py-2 font-mono text-xs">{d.leaf_width_1 || "—"}</td>
                      <td className="px-4 py-2 font-mono text-xs">{d.leaf_width_2 || "—"}</td>
                      <td className="px-4 py-2 font-mono text-xs text-zinc-400 whitespace-nowrap">
                        {[d.core_cutting_1, d.core_cutting_2].filter(Boolean).join(" / ") || "—"}
                      </td>
                      <td className="px-4 py-2">
                        <button data-testid={`import-remove-${i}`} onClick={() => removeRow(i)} className="text-zinc-600 hover:text-red-400 transition-colors">
                          <Trash size={16} weight="bold" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              data-testid="import-confirm-btn"
              onClick={() => confirmMut.mutate()}
              disabled={!name.trim() || !preview.doors.length || confirmMut.isPending}
              className="h-16 px-10 bg-ember text-black font-display font-black text-xl flex items-center gap-3 hover:bg-amber-600 transition-colors disabled:opacity-40"
            >
              <CheckCircle size={24} weight="bold" />
              {confirmMut.isPending ? "IMPORTING..." : `IMPORT ${preview.doors.length} DOORS AS DRAFT JOB`}
            </button>
          </>
        )}
      </main>
    </div>
  );
}
