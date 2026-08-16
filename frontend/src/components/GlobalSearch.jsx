import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { MagnifyingGlass, Door, Stack, FilePdf } from "@phosphor-icons/react";
import { api } from "@/lib/api";

export function GlobalSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    if (!q.trim()) { setResults(null); return; }
    const t = setTimeout(() => {
      api.get("/search", { params: { q } }).then((r) => { setResults(r.data); setOpen(true); }).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const onClick = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const go = (path) => { setOpen(false); setQ(""); navigate(path); };
  const has = results && (results.doors.length || results.jobs.length || results.files.length);

  return (
    <div className="relative flex-1 max-w-xl" ref={boxRef}>
      <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
      <input
        data-testid="global-search-input"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => results && setOpen(true)}
        placeholder="Search any door, level, job or file…"
        className="w-full h-11 bg-black/50 border border-white/15 pl-9 pr-3 font-mono text-xs placeholder:text-zinc-600 focus:outline-none focus:border-ember transition-colors"
      />
      {open && results && (
        <div className="absolute top-12 left-0 right-0 z-50 border border-white/15 bg-carbon shadow-2xl max-h-[70vh] overflow-y-auto" data-testid="global-search-results">
          {!has && <p className="px-4 py-5 font-mono text-xs text-zinc-500 tracking-[0.15em]">NOTHING FOUND — TRY A DOOR ID LIKE R1601.D3</p>}
          {results.doors.length > 0 && (
            <div className="py-2">
              <p className="px-4 py-1 font-mono text-[9px] tracking-[0.3em] text-zinc-600">DOORS</p>
              {results.doors.map((d) => (
                <button key={d.door_id} data-testid={`search-door-${d.door_id}`}
                  onClick={() => go(`/office/doors/${encodeURIComponent(d.door_id)}`)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 text-left transition-colors">
                  <Door size={16} className="text-ember shrink-0" />
                  <span className="font-mono text-sm font-bold text-ember">{d.door_id}</span>
                  <span className="text-xs text-zinc-400 truncate">{d.floor} · {d.location}</span>
                  {d.delivered && <span className="ml-auto font-mono text-[9px] text-emerald-400">DELIVERED</span>}
                </button>
              ))}
            </div>
          )}
          {results.jobs.length > 0 && (
            <div className="py-2 border-t border-white/5">
              <p className="px-4 py-1 font-mono text-[9px] tracking-[0.3em] text-zinc-600">JOBS</p>
              {results.jobs.map((j) => (
                <button key={j.id} data-testid={`search-job-${j.id}`} onClick={() => go("/office/jobs")}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 text-left transition-colors">
                  <Stack size={16} className="text-blue-400 shrink-0" />
                  <span className="text-sm font-semibold truncate">{j.name}</span>
                  <span className={`ml-auto font-mono text-[9px] ${j.released ? "text-emerald-400" : "text-zinc-500"}`}>
                    {j.released ? "RELEASED" : "DRAFT"}
                  </span>
                </button>
              ))}
            </div>
          )}
          {results.files.length > 0 && (
            <div className="py-2 border-t border-white/5">
              <p className="px-4 py-1 font-mono text-[9px] tracking-[0.3em] text-zinc-600">FILES</p>
              {results.files.map((f) => (
                <button key={f.id} data-testid={`search-file-${f.id}`}
                  onClick={() => go(`/files?focus=${encodeURIComponent(f.original_filename)}`)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 text-left transition-colors">
                  <FilePdf size={16} className="text-red-400 shrink-0" />
                  <span className="text-xs text-zinc-300 truncate">{f.original_filename}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
