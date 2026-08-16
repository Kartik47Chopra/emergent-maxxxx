import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { FileXls, Trash, CheckCircle, ArrowLeft, Files as FilesIcon, X } from "@phosphor-icons/react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { TopNav } from "@/components/TopNav";

export default function Import() {
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const [picked, setPicked] = useState([]);
  const [preview, setPreview] = useState(null);
  const [name, setName] = useState("");
  const [client, setClient] = useState("");

  const previewMut = useMutation({
    mutationFn: (list) => {
      const fd = new FormData();
      [...list].forEach((f) => fd.append("files", f));
      return api.post("/import/preview", fd);
    },
    onSuccess: (r) => {
      setPreview(r.data);
      setName(r.data.job_name);
      (r.data.warnings || []).forEach((w) => toast.warning(w));
      toast.success(`Found ${r.data.count} doors across ${r.data.sources.length} sheet${r.data.sources.length === 1 ? "" : "s"} — check them below`);
    },
    onError: (e) => toast.error(apiError(e, "Could not parse those files")),
  });

  const confirmMut = useMutation({
    mutationFn: () => api.post("/import/confirm", { name, client, doors: preview.doors }),
    onSuccess: (r) => {
      toast.success(`"${r.data.name}" is in — ${r.data.door_count} doors saved as a draft. Release it from the dashboard when the factory is ready.`);
      navigate("/office");
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const addFiles = (list) => setPicked((p) => [...p, ...[...list]]);
  const removeRow = (i) => setPreview((p) => ({ ...p, doors: p.doors.filter((_, j) => j !== i), count: p.count - 1 }));

  return (
    <div className="min-h-screen bg-obsidian text-white" data-testid="import-page">
      <TopNav />
      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8 space-y-8">
        <div>
          <p className="font-mono text-[10px] tracking-[0.3em] text-ember">BULK JOB IMPORT</p>
          <h1 className="font-display font-black text-4xl sm:text-5xl tracking-tighter mt-1">Import a Level</h1>
          <p className="text-zinc-400 text-sm mt-2 max-w-2xl">
            Grab every sheet for the level at once — Work List, Assembly, Core, Skin and Rail lists —
            and drop them in together. We'll match the doors up across all sheets automatically.
          </p>
        </div>

        {!preview && (
          <div className="space-y-4">
            <div
              data-testid="import-dropzone"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
              className="border-2 border-dashed border-white/20 bg-carbon hover:border-ember/50 transition-colors p-14 text-center"
            >
              <FileXls size={52} className="text-ember mx-auto mb-4" weight="duotone" />
              <p className="font-display font-extrabold text-2xl tracking-tight">Drop the level's Excel sheets here</p>
              <p className="font-mono text-[11px] tracking-[0.15em] text-zinc-500 mt-2">WORK LIST · ASSEMBLY SHEET · CORE / SKIN / RAIL CUTTING LISTS — ALL AT ONCE IS BEST</p>
              <input ref={fileRef} type="file" multiple accept=".xlsx,.xls" className="hidden" data-testid="import-file-input"
                onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
              <button data-testid="import-choose-btn" onClick={() => fileRef.current?.click()}
                className="mt-7 h-14 px-10 bg-ember text-black font-display font-black text-lg hover:bg-amber-600 active:translate-y-px transition-colors">
                CHOOSE FILES
              </button>
            </div>

            {picked.length > 0 && (
              <div className="border border-white/10 bg-carbon p-5 space-y-3" data-testid="import-picked-files">
                <p className="font-mono text-[10px] tracking-[0.25em] text-zinc-500">READY TO READ ({picked.length} SHEET{picked.length === 1 ? "" : "S"})</p>
                {picked.map((f, i) => (
                  <div key={i} className="flex items-center gap-3 border border-white/10 bg-black/40 px-4 py-3">
                    <FileXls size={20} className="text-emerald-400 shrink-0" />
                    <span className="text-sm font-medium flex-1 truncate">{f.name}</span>
                    <button data-testid={`import-remove-file-${i}`} onClick={() => setPicked((p) => p.filter((_, j) => j !== i))}
                      className="text-zinc-500 hover:text-red-400 transition-colors">
                      <X size={16} weight="bold" />
                    </button>
                  </div>
                ))}
                <button data-testid="import-read-btn" onClick={() => previewMut.mutate(picked)} disabled={previewMut.isPending}
                  className="w-full h-16 bg-ember text-black font-display font-black text-xl flex items-center justify-center gap-3 hover:bg-amber-600 transition-colors disabled:opacity-50">
                  <FilesIcon size={24} weight="bold" /> {previewMut.isPending ? "READING SHEETS..." : `READ ${picked.length} SHEET${picked.length === 1 ? "" : "S"}`}
                </button>
              </div>
            )}
          </div>
        )}

        {preview && (
          <>
            <div className="flex flex-wrap items-center gap-4">
              <button data-testid="import-back-btn" onClick={() => { setPreview(null); setPicked([]); }}
                className="h-12 px-5 border border-white/20 font-display font-bold flex items-center gap-2 hover:border-ember hover:text-ember transition-colors">
                <ArrowLeft size={18} weight="bold" /> START OVER
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

            <p className="font-mono text-[10px] tracking-[0.2em] text-zinc-500">
              MERGED FROM: {(preview.sources || []).join(" · ")}
            </p>

            <div className="border border-white/10 bg-carbon overflow-x-auto">
              <table className="w-full text-sm" data-testid="import-preview-table">
                <thead>
                  <tr className="border-b border-white/10">
                    {["DOOR ID", "FLOOR", "LOCATION", "TYPE", "HEIGHT", "W1", "W2", "CORE CUTTING", "SKIN CUTTING", ""].map((h) => (
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
                      <td className="px-4 py-2 font-mono text-xs text-zinc-400 whitespace-nowrap">
                        {[d.skin_cutting_1, d.skin_cutting_2].filter(Boolean).join(" / ") || "—"}
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
              {confirmMut.isPending ? "IMPORTING..." : `LOOKS GOOD — IMPORT ${preview.doors.length} DOORS`}
            </button>
          </>
        )}
      </main>
    </div>
  );
}
