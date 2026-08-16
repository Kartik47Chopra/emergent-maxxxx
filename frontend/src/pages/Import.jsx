import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  FileXls, FilePdf, File as FileIcon, X, CheckCircle, RocketLaunch,
  GoogleDriveLogo, UploadSimple, ArrowRight, Warning, ClockCounterClockwise,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { AppShell } from "@/components/AppShell";
import { timeAgo } from "@/lib/format";

const STEPS = [
  ["1", "Drop everything in", "Excel cutting lists AND the drawing PDFs — all levels at once is fine"],
  ["2", "We read every sheet", "Doors are matched across Work List, Assembly, Core, Skin and Rail lists — every column is kept"],
  ["3", "Levels become jobs", "One job per level appears, PDFs attach to their level. Release when the factory's ready"],
];

function fileIcon(name) {
  if (/\.(xlsx|xlsm|xls|csv)$/i.test(name)) return <FileXls size={20} className="text-emerald-400 shrink-0" />;
  if (/\.pdf$/i.test(name)) return <FilePdf size={20} className="text-red-400 shrink-0" />;
  return <FileIcon size={20} className="text-zinc-400 shrink-0" />;
}

function RunResult({ run, onRelease, releasing }) {
  const navigate = useNavigate();
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
      className="border border-emerald-500/30 bg-emerald-500/5 p-6 space-y-5" data-testid="import-result">
      <div className="flex items-center gap-3">
        <CheckCircle size={32} weight="fill" className="text-emerald-400" />
        <div>
          <p className="font-display font-extrabold text-2xl tracking-tight">
            {run.doors_imported} doors imported across {run.jobs_created.length} level{run.jobs_created.length === 1 ? "" : "s"}
          </p>
          <p className="font-mono text-[11px] text-zinc-500 mt-0.5">
            {run.attachments?.length ? `${run.attachments.length} drawings filed in the vault automatically` : "No PDFs in this batch"}
          </p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {run.jobs_created.map((j) => (
          <div key={j.id} data-testid={`import-job-${j.id}`} className="border border-white/10 bg-black/40 p-4 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-display font-bold truncate">{j.name}</p>
              <p className="font-mono text-[10px] text-zinc-500">{j.floor} · {j.door_count} DOORS</p>
            </div>
            {j.released ? (
              <span className="font-mono text-[9px] text-emerald-400 tracking-[0.15em]">RELEASED</span>
            ) : (
              <button data-testid={`import-release-${j.id}`} onClick={() => onRelease(j.id)} disabled={releasing}
                className="h-10 px-4 bg-ember text-black font-display font-bold text-xs hover:bg-amber-600 transition-colors flex items-center gap-1.5 disabled:opacity-50">
                <RocketLaunch size={14} weight="bold" /> RELEASE
              </button>
            )}
          </div>
        ))}
      </div>

      {run.skipped_door_ids?.length > 0 && (
        <p className="font-mono text-[11px] text-amber-400 flex items-start gap-2" data-testid="import-skipped">
          <Warning size={14} className="shrink-0 mt-0.5" />
          Already in the system, skipped: {run.skipped_door_ids.join(", ")}
        </p>
      )}
      {run.errors?.length > 0 && run.errors.map((e, i) => (
        <p key={i} className="font-mono text-[11px] text-red-400">{e}</p>
      ))}

      <button data-testid="import-view-doors-btn" onClick={() => navigate("/office/doors")}
        className="h-12 px-6 border border-white/20 font-display font-bold flex items-center gap-2 hover:border-ember hover:text-ember transition-colors">
        SEE THE DOORS <ArrowRight size={18} weight="bold" />
      </button>
    </motion.div>
  );
}

export default function Import() {
  const qc = useQueryClient();
  const fileRef = useRef(null);
  const [picked, setPicked] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState(null);
  const [driveUrl, setDriveUrl] = useState("");
  const [driveRunId, setDriveRunId] = useState(null);

  const { data: runs = [] } = useQuery({
    queryKey: ["import-runs"],
    queryFn: () => api.get("/import/runs").then((r) => r.data),
  });

  const { data: driveRun } = useQuery({
    queryKey: ["import-run", driveRunId],
    queryFn: () => api.get(`/import/runs/${driveRunId}`).then((r) => r.data),
    enabled: !!driveRunId,
    refetchInterval: 2500,
  });

  useEffect(() => {
    if (driveRun && (driveRun.status === "done" || driveRun.status === "failed")) {
      setDriveRunId(null);
      qc.invalidateQueries();
      if (driveRun.status === "done") {
        setResult(driveRun);
        toast.success("Google Drive import finished");
      } else {
        toast.error(driveRun.errors?.[0] || "Drive import failed");
      }
    }
  }, [driveRun, qc]);

  const uploadMut = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      picked.forEach((f) => fd.append("files", f));
      return api.post("/import/run", fd);
    },
    onSuccess: (r) => {
      setResult(r.data);
      setPicked([]);
      qc.invalidateQueries();
      toast.success(`${r.data.doors_imported} doors imported`);
    },
    onError: (e) => toast.error(apiError(e, "Could not read those files")),
  });

  const driveMut = useMutation({
    mutationFn: () => api.post("/import/drive", { url: driveUrl }),
    onSuccess: (r) => {
      setDriveRunId(r.data.run_id);
      setResult(null);
      toast.success("Fetching your Drive folder — this can take a minute for big folders");
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const releaseMut = useMutation({
    mutationFn: (jobId) => api.post(`/jobs/${jobId}/release`),
    onSuccess: (_, jobId) => {
      toast.success("Released to the factory floor");
      setResult((r) => r && { ...r, jobs_created: r.jobs_created.map((j) => (j.id === jobId ? { ...j, released: true } : j)) });
      qc.invalidateQueries({ queryKey: ["jobs"] });
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const addFiles = (list) => setPicked((p) => [...p, ...[...list]]);
  const driveBusy = !!driveRunId;

  return (
    <AppShell testId="import-page">
      <main className="max-w-[1200px] mx-auto px-4 sm:px-6 py-8 space-y-8">
        <div>
          <p className="font-mono text-[10px] tracking-[0.3em] text-ember">BULK IMPORT — NO TYPING NEEDED</p>
          <h1 className="font-display font-black text-4xl sm:text-5xl tracking-tighter mt-1">Import your files</h1>
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          {STEPS.map(([n, title, hint]) => (
            <div key={n} className="border border-white/10 bg-carbon p-4 flex gap-3">
              <span className="font-display font-black text-3xl text-ember/60">{n}</span>
              <div>
                <p className="font-display font-bold">{title}</p>
                <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{hint}</p>
              </div>
            </div>
          ))}
        </div>

        {result && <RunResult run={result} onRelease={(id) => releaseMut.mutate(id)} releasing={releaseMut.isPending} />}

        <div className="grid lg:grid-cols-2 gap-4 items-start">
          <div className="space-y-4">
            <div
              data-testid="import-dropzone"
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
              className={`border-2 border-dashed p-10 text-center transition-colors ${dragging ? "border-ember bg-ember/10" : "border-white/20 bg-carbon hover:border-ember/50"}`}
            >
              <UploadSimple size={44} className={`mx-auto mb-3 ${dragging ? "text-ember" : "text-zinc-500"}`} weight="duotone" />
              <p className="font-display font-extrabold text-xl tracking-tight">Drop Excel sheets & PDFs here</p>
              <p className="font-mono text-[10px] tracking-[0.15em] text-zinc-500 mt-2">AS MANY LEVELS AS YOU LIKE — ALL AT ONCE</p>
              <input ref={fileRef} type="file" multiple accept=".xlsx,.xls,.xlsm,.pdf,.png,.jpg,.jpeg" className="hidden" data-testid="import-file-input"
                onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
              <button data-testid="import-choose-btn" onClick={() => fileRef.current?.click()}
                className="mt-6 h-12 px-8 bg-ember text-black font-display font-black hover:bg-amber-600 active:translate-y-px transition-colors">
                CHOOSE FILES
              </button>
            </div>

            {picked.length > 0 && (
              <div className="border border-white/10 bg-carbon p-5 space-y-3" data-testid="import-picked-files">
                <p className="font-mono text-[10px] tracking-[0.25em] text-zinc-500">READY TO IMPORT ({picked.length} FILE{picked.length === 1 ? "" : "S"})</p>
                <div className="max-h-64 overflow-y-auto space-y-2">
                  {picked.map((f, i) => (
                    <div key={i} className="flex items-center gap-3 border border-white/10 bg-black/40 px-4 py-2.5">
                      {fileIcon(f.name)}
                      <span className="text-sm font-medium flex-1 truncate">{f.name}</span>
                      <button data-testid={`import-remove-file-${i}`} onClick={() => setPicked((p) => p.filter((_, j) => j !== i))}
                        className="text-zinc-500 hover:text-red-400 transition-colors"><X size={16} weight="bold" /></button>
                    </div>
                  ))}
                </div>
                <button data-testid="import-run-btn" onClick={() => uploadMut.mutate()} disabled={uploadMut.isPending}
                  className="w-full h-16 bg-ember text-black font-display font-black text-xl flex items-center justify-center gap-3 hover:bg-amber-600 transition-colors disabled:opacity-50">
                  {uploadMut.isPending ? "READING EVERY SHEET…" : `IMPORT EVERYTHING (${picked.length})`}
                </button>
              </div>
            )}
          </div>

          <div className="border border-white/10 bg-carbon p-6 space-y-4" data-testid="import-drive-card">
            <div className="flex items-center gap-3">
              <GoogleDriveLogo size={30} weight="duotone" className="text-blue-400" />
              <div>
                <p className="font-display font-extrabold text-xl tracking-tight">Or paste a Google Drive link</p>
                <p className="text-xs text-zinc-500 mt-0.5">Share the folder as "Anyone with the link" and we'll grab every file inside — subfolders too.</p>
              </div>
            </div>
            <input data-testid="import-drive-input" value={driveUrl} onChange={(e) => setDriveUrl(e.target.value)}
              placeholder="https://drive.google.com/drive/folders/…"
              className="w-full h-12 bg-black/50 border border-white/15 px-4 font-mono text-xs placeholder:text-zinc-600 focus:outline-none focus:border-ember transition-colors" />
            <button data-testid="import-drive-btn" onClick={() => driveMut.mutate()}
              disabled={!driveUrl.trim() || driveMut.isPending || driveBusy}
              className="w-full h-14 bg-blue-500/20 border border-blue-500/50 text-blue-300 font-display font-extrabold flex items-center justify-center gap-2 hover:bg-blue-500/30 transition-colors disabled:opacity-40">
              {driveBusy ? (
                <>
                  <span className="w-4 h-4 border-2 border-blue-300 border-t-transparent rounded-full animate-spin" />
                  {driveRun?.status === "downloading" ? "DOWNLOADING FROM DRIVE…" : driveRun?.status === "processing" ? `READING ${driveRun.file_count || ""} FILES…` : "STARTING…"}
                </>
              ) : "IMPORT FROM DRIVE"}
            </button>
          </div>
        </div>

        {runs.length > 0 && (
          <div className="border border-white/10 bg-carbon" data-testid="import-history">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-white/10">
              <ClockCounterClockwise size={18} className="text-zinc-500" />
              <p className="font-mono text-[10px] tracking-[0.25em] text-zinc-500">PAST IMPORTS</p>
            </div>
            <div className="divide-y divide-white/5">
              {runs.slice(0, 8).map((r) => (
                <div key={r.id} className="px-5 py-3 flex items-center gap-4 text-sm">
                  <span className={`font-mono text-[9px] tracking-[0.15em] px-2 py-1 border shrink-0 ${
                    r.status === "done" ? "text-emerald-400 border-emerald-500/40" :
                    r.status === "failed" ? "text-red-400 border-red-500/40" : "text-amber-400 border-amber-500/40"
                  }`}>{r.status.toUpperCase()}</span>
                  <span className="text-zinc-400 truncate flex-1">
                    {r.source === "google_drive" ? "Google Drive" : r.source === "upload" ? "File upload" : "Setup"} — {r.doors_imported || 0} doors, {(r.jobs_created || []).length} levels, {(r.attachments || []).length} drawings
                  </span>
                  <span className="font-mono text-[10px] text-zinc-600 shrink-0">{timeAgo(r.started_at)} · {r.by}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </AppShell>
  );
}
