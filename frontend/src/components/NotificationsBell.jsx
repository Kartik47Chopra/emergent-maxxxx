import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, WarningCircle, Truck, ArrowsClockwise, DownloadSimple, RocketLaunch } from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/format";

const KIND_ICON = {
  qc_fail: [WarningCircle, "text-red-400"],
  despatch: [Truck, "text-emerald-400"],
  rework: [ArrowsClockwise, "text-amber-400"],
  import: [DownloadSimple, "text-blue-400"],
  release: [RocketLaunch, "text-ember"],
};

export function NotificationsBell() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.get("/notifications").then((r) => r.data),
    refetchInterval: 15000,
  });

  const readAllMut = useMutation({
    mutationFn: () => api.post("/notifications/read-all"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const items = data?.items || [];
  const unread = data?.unread || 0;

  return (
    <div className="relative" ref={ref}>
      <button data-testid="notifications-bell" onClick={() => setOpen((o) => !o)}
        className="relative w-11 h-11 border border-white/15 flex items-center justify-center text-zinc-400 hover:text-ember hover:border-ember/50 transition-colors">
        <Bell size={18} weight="bold" />
        {unread > 0 && (
          <span data-testid="notifications-unread" className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 bg-red-500 text-white font-mono text-[10px] font-bold flex items-center justify-center rounded-full">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-50 w-96 max-w-[90vw] border border-white/15 bg-carbon shadow-2xl" data-testid="notifications-panel">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <p className="font-mono text-[10px] tracking-[0.25em] text-zinc-400">WHAT'S HAPPENING</p>
            {unread > 0 && (
              <button data-testid="notifications-read-all" onClick={() => readAllMut.mutate()}
                className="font-mono text-[10px] text-ember hover:underline">MARK ALL READ</button>
            )}
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {!items.length && <p className="px-4 py-8 font-mono text-xs text-zinc-600 text-center tracking-[0.15em]">ALL QUIET ON THE FACTORY FLOOR</p>}
            {items.map((n) => {
              const [Icon, tone] = KIND_ICON[n.kind] || [Bell, "text-zinc-400"];
              return (
                <button key={n.id} data-testid={`notification-${n.id}`}
                  onClick={() => {
                    api.post(`/notifications/${n.id}/read`).then(() => qc.invalidateQueries({ queryKey: ["notifications"] }));
                    if (n.door_id) { setOpen(false); navigate(`/office/doors/${encodeURIComponent(n.door_id)}`); }
                  }}
                  className={`w-full flex gap-3 px-4 py-3 text-left border-b border-white/5 hover:bg-white/5 transition-colors ${n.read ? "opacity-50" : ""}`}>
                  <Icon size={18} className={`${tone} shrink-0 mt-0.5`} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-snug">{n.title}</p>
                    {n.body && <p className="text-xs text-zinc-500 truncate mt-0.5">{n.body}</p>}
                    <p className="font-mono text-[10px] text-zinc-600 mt-1">{timeAgo(n.at)}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
