import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Plus, Trash, FloppyDisk } from "@phosphor-icons/react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { TopNav } from "@/components/TopNav";

const EMPTY_DOOR = {
  floor: "", location: "", door_type: "DSC-03d", qty: 1, internal_door: "Yes",
  door_id: "", leaf_height: "", leaf_width_1: "", leaf_width_2: "",
  panel_thickness: "", actual_thickness: "", leaf_type: "Single",
  panel_finish: "", fire_rating: "FD60",
  core_qty: 1, core_type: "", core_cutting: "",
  skin_qty: 2, skin_type: "", skin_cutting: "",
};

const FIELDS = [
  ["floor", "FLOOR *"], ["location", "LOCATION *"], ["door_id", "DOOR ID *"], ["door_type", "DOOR TYPE"],
  ["qty", "QTY", "number"], ["internal_door", "INTERNAL DOOR"],
  ["leaf_height", "LEAF HEIGHT"], ["leaf_width_1", "LEAF WIDTH 1"], ["leaf_width_2", "LEAF WIDTH 2"],
  ["leaf_type", "LEAF TYPE"], ["panel_thickness", "PANEL THICKNESS"], ["actual_thickness", "ACTUAL THICKNESS"],
  ["panel_finish", "PANEL FINISH"], ["fire_rating", "FIRE RATING"],
  ["core_qty", "CORE QTY", "number"], ["core_type", "CORE TYPE"], ["core_cutting", "CORE CUTTING DIMS"],
  ["skin_qty", "SKIN QTY", "number"], ["skin_type", "SKIN TYPE"], ["skin_cutting", "SKIN CUTTING DIMS"],
];

export default function JobCreate() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [doors, setDoors] = useState([{ ...EMPTY_DOOR }]);

  const saveMut = useMutation({
    mutationFn: () => api.post("/jobs", {
      name, client,
      doors: doors.map((d) => ({
        ...d,
        qty: Number(d.qty) || 1,
        core_qty: Number(d.core_qty) || 0,
        skin_qty: Number(d.skin_qty) || 0,
      })),
    }),
    onSuccess: () => {
      toast.success("Job saved as draft — release it from the dashboard when ready");
      navigate("/office");
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const setDoor = (i, key, val) => {
    setDoors((ds) => ds.map((d, j) => (j === i ? { ...d, [key]: val } : d)));
  };

  const valid = name.trim() && doors.every((d) => d.floor.trim() && d.location.trim() && d.door_id.trim());

  return (
    <div className="min-h-screen bg-obsidian text-white" data-testid="job-create-page">
      <TopNav />
      <main className="max-w-[1200px] mx-auto px-4 sm:px-6 py-8 space-y-8">
        <div>
          <p className="font-mono text-[10px] tracking-[0.3em] text-ember">PART NUMBER CREATION</p>
          <h1 className="font-display font-black text-4xl sm:text-5xl tracking-tighter mt-1">New Job</h1>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="job-name" className="font-mono text-[10px] tracking-[0.25em] text-zinc-500 block mb-2">JOB NAME *</label>
            <input id="job-name" data-testid="job-name-input" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Riverside Gate - Tower B"
              className="w-full h-12 bg-carbon border border-white/15 px-4 text-sm focus:outline-none focus:border-ember transition-colors" />
          </div>
          <div>
            <label htmlFor="job-client" className="font-mono text-[10px] tracking-[0.25em] text-zinc-500 block mb-2">CLIENT</label>
            <input id="job-client" data-testid="job-client-input" value={client} onChange={(e) => setClient(e.target.value)}
              placeholder="Meridian Construction"
              className="w-full h-12 bg-carbon border border-white/15 px-4 text-sm focus:outline-none focus:border-ember transition-colors" />
          </div>
        </div>

        <div className="space-y-6">
          {doors.map((door, i) => (
            <div key={i} className="border border-white/10 bg-carbon" data-testid={`door-form-${i}`}>
              <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
                <p className="font-mono text-xs tracking-[0.25em] text-ember">DOOR {String(i + 1).padStart(2, "0")} {door.door_id && `— ${door.door_id}`}</p>
                {doors.length > 1 && (
                  <button data-testid={`remove-door-${i}`} onClick={() => setDoors((ds) => ds.filter((_, j) => j !== i))}
                    className="text-zinc-500 hover:text-red-400 transition-colors">
                    <Trash size={18} weight="bold" />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 p-5">
                {FIELDS.map(([key, label, type]) => (
                  <div key={key}>
                    <label htmlFor={`door-${i}-${key}`} className="font-mono text-[9px] tracking-[0.2em] text-zinc-500 block mb-1">{label}</label>
                    <input
                      id={`door-${i}-${key}`}
                      data-testid={`door-${i}-${key}`}
                      type={type || "text"}
                      value={door[key]}
                      onChange={(e) => setDoor(i, key, e.target.value)}
                      className="w-full h-11 bg-black/50 border border-white/15 px-3 font-mono text-xs focus:outline-none focus:border-ember transition-colors"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-4">
          <button
            data-testid="add-door-btn"
            onClick={() => setDoors((ds) => [...ds, { ...EMPTY_DOOR, floor: ds[ds.length - 1]?.floor || "" }])}
            className="h-14 px-6 border border-white/20 font-display font-bold flex items-center gap-2 hover:border-ember hover:text-ember transition-colors"
          >
            <Plus size={20} weight="bold" /> ADD DOOR
          </button>
          <button
            data-testid="save-job-btn"
            onClick={() => saveMut.mutate()}
            disabled={!valid || saveMut.isPending}
            className="h-14 px-8 bg-ember text-black font-display font-extrabold flex items-center gap-2 hover:bg-amber-600 transition-colors disabled:opacity-40"
          >
            <FloppyDisk size={20} weight="bold" /> {saveMut.isPending ? "SAVING..." : "SAVE JOB (DRAFT)"}
          </button>
        </div>
      </main>
    </div>
  );
}
