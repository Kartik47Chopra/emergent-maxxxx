import { useAuth } from "@/context/AuthContext";
import CoreSkin from "@/pages/stations/CoreSkin";
import Assembly from "@/pages/stations/Assembly";
import Press from "@/pages/stations/Press";
import Routing from "@/pages/stations/Routing";

export default function Station() {
  const { user } = useAuth();
  switch (user?.station) {
    case "core": return <CoreSkin mode="core" />;
    case "skin": return <CoreSkin mode="skin" />;
    case "assembly": return <Assembly />;
    case "press": return <Press />;
    case "routing": return <Routing />;
    default:
      return (
        <div className="min-h-screen bg-obsidian text-white flex items-center justify-center font-mono text-sm tracking-[0.2em]" data-testid="station-unknown">
          NO STATION ASSIGNED TO THIS ACCOUNT
        </div>
      );
  }
}
