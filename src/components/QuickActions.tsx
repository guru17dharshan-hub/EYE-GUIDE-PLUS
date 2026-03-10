import {
  ScanSearch,
  Bus,
  MapPin,
  Map,
  Home,
  Save,
  Phone,
  UserPlus,
  Users,
  AlertTriangle,
  Volume2,
  VolumeX,
  Vibrate,
  RefreshCw,
  HelpCircle,
  Settings,
  Camera,
} from "lucide-react";

interface QuickActionsProps {
  onAction: (command: string) => void;
  autoScan: boolean;
  hapticEnabled: boolean;
  showMap: boolean;
  cameraOn: boolean;
  onOpenManage?: () => void;
}

const actions = [
  { label: "Scan", icon: ScanSearch, command: "scan", color: "bg-primary" },
  { label: "Find Bus", icon: Bus, command: "find bus", color: "bg-primary" },
  { label: "Bus Status", icon: Bus, command: "bus status", color: "bg-primary" },
  { label: "Where Am I", icon: MapPin, command: "where am i", color: "bg-primary" },
  { label: "Show Map", icon: Map, command: "show map", color: "bg-primary", toggleKey: "showMap", altCommand: "close map", altLabel: "Hide Map" },
  { label: "Save Home", icon: Home, command: "save home", color: "bg-accent" },
  { label: "Save Location", icon: Save, command: "save location", color: "bg-accent" },
  { label: "My Places", icon: MapPin, command: "my places", color: "bg-accent" },
  { label: "Add Contact", icon: UserPlus, command: "add contact", color: "bg-secondary" },
  { label: "My Contacts", icon: Users, command: "my contacts", color: "bg-secondary" },
  { label: "Call", icon: Phone, command: "call", color: "bg-secondary" },
  { label: "SOS", icon: AlertTriangle, command: "emergency", color: "bg-destructive" },
  { label: "Camera On", icon: Camera, command: "camera on", toggleKey: "cameraOn", altCommand: "camera off", altLabel: "Camera Off", color: "bg-muted" },
  { label: "Auto Scan", icon: RefreshCw, command: "auto scan on", toggleKey: "autoScan", altCommand: "auto scan off", altLabel: "Auto Scan Off", color: "bg-muted" },
  { label: "Haptic", icon: Vibrate, command: "haptic on", toggleKey: "hapticEnabled", altCommand: "haptic off", altLabel: "Haptic Off", color: "bg-muted" },
  { label: "Help", icon: HelpCircle, command: "help", color: "bg-muted" },
];

const QuickActions = ({ onAction, autoScan, hapticEnabled, showMap, onOpenManage }: QuickActionsProps) => {
  const toggleState: Record<string, boolean> = { autoScan, hapticEnabled, showMap };

  return (
    <section className="p-3 bg-card border-t border-border" aria-label="Quick actions">
      <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
        ⚡ Quick Actions
      </h2>
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => {
          const isToggle = action.toggleKey;
          const isActive = isToggle ? toggleState[action.toggleKey!] : false;
          const label = isToggle && isActive ? (action.altLabel || action.label) : action.label;
          const cmd = isToggle && isActive ? (action.altCommand || action.command) : action.command;
          const Icon = action.icon;
          const isSOS = action.command === "emergency";

          return (
            <button
              key={action.command}
              onClick={() => onAction(cmd)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all active:scale-95 ${
                isSOS
                  ? "bg-destructive text-destructive-foreground animate-pulse"
                  : isToggle && isActive
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground hover:bg-accent"
              }`}
              aria-label={label}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {label}
            </button>
          );
        })}

        {/* Manage button for manual entry */}
        {onOpenManage && (
          <button
            onClick={onOpenManage}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all active:scale-95 bg-secondary text-secondary-foreground hover:bg-secondary/80"
            aria-label="Manage contacts and locations"
          >
            <Settings className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Manage
          </button>
        )}
      </div>
    </section>
  );
};

export default QuickActions;
