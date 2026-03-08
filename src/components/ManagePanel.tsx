import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  X, Plus, Trash2, Phone, MapPin, Home, Save, Users, Navigation,
} from "lucide-react";
import { EmergencyContact } from "@/hooks/useEmergencyContacts";
import { SavedLocation } from "@/hooks/useSavedLocations";
import { GeoPosition } from "@/hooks/useGeolocation";

interface ManagePanelProps {
  // Contacts
  contacts: EmergencyContact[];
  onAddContact: (name: string, phone: string) => void;
  onRemoveContact: (id: string) => void;
  onCallContact: (contact: EmergencyContact) => void;
  // Locations
  locations: SavedLocation[];
  onSetHome: (lat: number, lng: number) => void;
  onAddLocation: (name: string, lat: number, lng: number) => SavedLocation;
  onRemoveLocation: (id: string) => void;
  position: GeoPosition | null;
  onClose: () => void;
}

const ManagePanel = ({
  contacts, onAddContact, onRemoveContact, onCallContact,
  locations, onSetHome, onAddLocation, onRemoveLocation,
  position, onClose,
}: ManagePanelProps) => {
  const [tab, setTab] = useState<"contacts" | "locations">("contacts");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [locName, setLocName] = useState("");
  const [manualLat, setManualLat] = useState("");
  const [manualLng, setManualLng] = useState("");
  const [useManualCoords, setUseManualCoords] = useState(false);

  const handleAddContact = () => {
    if (!name.trim() || !phone.trim()) return;
    onAddContact(name, phone);
    setName("");
    setPhone("");
  };

  const handleSaveCurrentLocation = () => {
    if (useManualCoords) {
      const lat = parseFloat(manualLat);
      const lng = parseFloat(manualLng);
      if (!locName.trim() || isNaN(lat) || isNaN(lng)) return;
      onAddLocation(locName, lat, lng);
      setLocName("");
      setManualLat("");
      setManualLng("");
    } else {
      if (!position || !locName.trim()) return;
      onAddLocation(locName, position.lat, position.lng);
      setLocName("");
    }
  };

  const handleSaveAsHome = () => {
    if (useManualCoords) {
      const lat = parseFloat(manualLat);
      const lng = parseFloat(manualLng);
      if (isNaN(lat) || isNaN(lng)) return;
      onSetHome(lat, lng);
    } else {
      if (!position) return;
      onSetHome(position.lat, position.lng);
    }
  };

  const canSaveLocation = useManualCoords
    ? locName.trim() && !isNaN(parseFloat(manualLat)) && !isNaN(parseFloat(manualLng))
    : position && locName.trim();

  const canSaveHome = useManualCoords
    ? !isNaN(parseFloat(manualLat)) && !isNaN(parseFloat(manualLng))
    : !!position;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-background/80 backdrop-blur-sm"
      role="dialog"
      aria-label="Manage contacts and locations"
    >
      <div className="w-full max-w-md bg-card border border-border rounded-t-2xl sm:rounded-2xl p-5 space-y-4 max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-foreground">Manage</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          <Button
            variant={tab === "contacts" ? "default" : "outline"}
            size="sm"
            onClick={() => setTab("contacts")}
            className="flex-1"
          >
            <Users className="h-4 w-4 mr-1.5" /> Contacts
          </Button>
          <Button
            variant={tab === "locations" ? "default" : "outline"}
            size="sm"
            onClick={() => setTab("locations")}
            className="flex-1"
          >
            <MapPin className="h-4 w-4 mr-1.5" /> Locations
          </Button>
        </div>

        {/* Contacts Tab */}
        {tab === "contacts" && (
          <div className="space-y-3">
            {contacts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No emergency contacts saved yet.
              </p>
            ) : (
              <div className="space-y-2" role="list">
                {contacts.map((c) => (
                  <div key={c.id} role="listitem" className="flex items-center gap-3 rounded-xl p-3 bg-muted border border-border">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.phone}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => onCallContact(c)} aria-label={`Call ${c.name}`} className="text-primary">
                      <Phone className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => onRemoveContact(c.id)} aria-label={`Remove ${c.name}`} className="text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <div className="space-y-2 pt-2 border-t border-border">
              <Input
                placeholder="Contact name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                aria-label="Contact name"
                className="bg-background"
              />
              <Input
                placeholder="Phone number"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                maxLength={20}
                aria-label="Phone number"
                className="bg-background"
              />
              <Button
                variant="outline"
                size="lg"
                className="w-full"
                onClick={handleAddContact}
                disabled={!name.trim() || !phone.trim()}
              >
                <Plus className="h-5 w-5 mr-2" /> Add Contact
              </Button>
            </div>
          </div>
        )}

        {/* Locations Tab */}
        {tab === "locations" && (
          <div className="space-y-3">
            {/* Current position info */}
            <div className="flex items-center gap-2 rounded-xl p-3 bg-primary/10 border border-primary/20">
              <Navigation className="h-4 w-4 text-primary shrink-0" />
              <span className="text-xs text-foreground">
                {position
                  ? `Current: ${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`
                  : "Location not available yet…"}
              </span>
            </div>

            {/* Toggle: use GPS or manual */}
            <div className="flex gap-2">
              <Button
                variant={!useManualCoords ? "default" : "outline"}
                size="sm"
                className="flex-1"
                onClick={() => setUseManualCoords(false)}
              >
                <Navigation className="h-4 w-4 mr-1.5" /> Use GPS
              </Button>
              <Button
                variant={useManualCoords ? "default" : "outline"}
                size="sm"
                className="flex-1"
                onClick={() => setUseManualCoords(true)}
              >
                <MapPin className="h-4 w-4 mr-1.5" /> Enter Manually
              </Button>
            </div>

            {/* Manual coordinate inputs */}
            {useManualCoords && (
              <div className="flex gap-2">
                <Input
                  placeholder="Latitude"
                  type="number"
                  step="any"
                  value={manualLat}
                  onChange={(e) => setManualLat(e.target.value)}
                  aria-label="Latitude"
                  className="bg-background flex-1"
                />
                <Input
                  placeholder="Longitude"
                  type="number"
                  step="any"
                  value={manualLng}
                  onChange={(e) => setManualLng(e.target.value)}
                  aria-label="Longitude"
                  className="bg-background flex-1"
                />
              </div>
            )}

            {/* Quick save buttons */}
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={handleSaveAsHome}
              disabled={!canSaveHome}
            >
              <Home className="h-4 w-4 mr-1.5" /> Set {useManualCoords ? "Coordinates" : "Current Location"} as Home
            </Button>

            {/* Save with custom name */}
            <div className="flex gap-2">
              <Input
                placeholder="Location name (e.g. Office)"
                value={locName}
                onChange={(e) => setLocName(e.target.value)}
                maxLength={100}
                aria-label="Location name"
                className="bg-background flex-1"
              />
              <Button
                variant="outline"
                onClick={handleSaveCurrentLocation}
                disabled={!canSaveLocation}
              >
                <Save className="h-4 w-4" />
              </Button>
            </div>

            {/* Saved locations list */}
            {locations.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No saved locations yet.
              </p>
            ) : (
              <div className="space-y-2" role="list">
                {locations.map((loc) => (
                  <div key={loc.id} role="listitem" className="flex items-center gap-3 rounded-xl p-3 bg-muted border border-border">
                    <div className={`flex items-center justify-center h-8 w-8 rounded-lg text-sm ${loc.type === "home" ? "bg-primary text-primary-foreground" : "bg-accent text-accent-foreground"}`}>
                      {loc.type === "home" ? "🏠" : "📍"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{loc.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}
                        {loc.visits ? ` • ${loc.visits} visits` : ""}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => onRemoveLocation(loc.id)} aria-label={`Remove ${loc.name}`} className="text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ManagePanel;
