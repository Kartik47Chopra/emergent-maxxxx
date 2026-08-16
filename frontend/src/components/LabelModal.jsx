import { X, Printer } from "@phosphor-icons/react";

export function Barcode({ value }) {
  const bars = [...value].flatMap((c) => {
    const n = c.charCodeAt(0);
    return [(n % 3) + 1, ((n >> 2) % 2) + 1];
  });
  return (
    <div className="flex items-stretch h-16 justify-center" aria-hidden="true">
      {bars.map((w, i) => (
        <div key={i} style={{ width: w * 2.5 }} className={i % 2 === 0 ? "bg-black" : "bg-white"} />
      ))}
    </div>
  );
}

export function LabelModal({ door, title = "DOOR ID STICKER", onClose }) {
  if (!door) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6" data-testid="label-modal">
      <div className="w-full max-w-md">
        <div className="print-area bg-white text-black p-8 border-4 border-black">
          <div className="flex items-start justify-between mb-6">
            <div>
              <p className="font-mono text-[10px] tracking-[0.3em] text-zinc-500">MAXX DOORS / {title}</p>
              <p className="font-display font-black text-4xl tracking-tighter mt-2">{door.door_id}</p>
            </div>
            <div className="hazard-stripes h-3 w-20 mt-1" />
          </div>
          <Barcode value={door.door_id} />
          <p className="font-mono text-center text-sm tracking-[0.5em] mt-2">{door.door_id}</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 mt-6 font-mono text-xs border-t-2 border-black pt-4">
            <span className="text-zinc-500">FLOOR</span><span className="text-right font-bold">{door.floor}</span>
            <span className="text-zinc-500">LOCATION</span><span className="text-right font-bold">{door.location}</span>
            <span className="text-zinc-500">TYPE</span><span className="text-right font-bold">{door.door_type}</span>
            <span className="text-zinc-500">FINISH</span><span className="text-right font-bold">{door.panel_finish}</span>
            <span className="text-zinc-500">FIRE RATING</span><span className="text-right font-bold">{door.fire_rating}</span>
          </div>
        </div>
        <div className="flex gap-3 mt-4 print:hidden">
          <button
            data-testid="label-print-btn"
            onClick={() => window.print()}
            className="flex-1 h-14 bg-ember text-black font-display font-extrabold flex items-center justify-center gap-2 hover:bg-amber-600 transition-colors"
          >
            <Printer size={20} weight="bold" /> PRINT STICKER
          </button>
          <button
            data-testid="label-close-btn"
            onClick={onClose}
            className="h-14 px-6 border border-white/20 text-white font-display font-bold flex items-center gap-2 hover:bg-white/10 transition-colors"
          >
            <X size={20} weight="bold" /> CLOSE
          </button>
        </div>
      </div>
    </div>
  );
}
