import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Phone, Plus, Trash2, X } from "lucide-react";
import { EmergencyContact } from "@/hooks/useEmergencyContacts";

interface EmergencyContactsProps {
  contacts: EmergencyContact[];
  onAdd: (name: string, phone: string) => void;
  onRemove: (id: string) => void;
  onCall: (contact: EmergencyContact) => void;
  onClose: () => void;
}

const EmergencyContacts = ({
  contacts,
  onAdd,
  onRemove,
  onCall,
  onClose,
}: EmergencyContactsProps) => {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  const handleAdd = () => {
    if (!name.trim() || !phone.trim()) return;
    onAdd(name, phone);
    setName("");
    setPhone("");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-background/80 backdrop-blur-sm"
      role="dialog"
      aria-label="Emergency Contacts"
    >
      <div className="w-full max-w-md bg-card border border-border rounded-t-2xl sm:rounded-2xl p-5 space-y-4 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-foreground">Emergency Contacts</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Close"
            className="focus-ring"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Contact list */}
        {contacts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No emergency contacts saved. Add one below.
          </p>
        ) : (
          <div className="space-y-2" role="list" aria-label="Saved emergency contacts">
            {contacts.map((contact) => (
              <div
                key={contact.id}
                role="listitem"
                className="flex items-center gap-3 rounded-xl p-3 bg-muted border border-border"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {contact.name}
                  </p>
                  <p className="text-xs text-muted-foreground">{contact.phone}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onCall(contact)}
                  aria-label={`Call ${contact.name}`}
                  className="focus-ring text-primary"
                >
                  <Phone className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemove(contact.id)}
                  aria-label={`Remove ${contact.name}`}
                  className="focus-ring text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Add contact form */}
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
            className="w-full focus-ring"
            onClick={handleAdd}
            disabled={!name.trim() || !phone.trim()}
          >
            <Plus className="h-5 w-5 mr-2" aria-hidden="true" />
            Add Contact
          </Button>
        </div>
      </div>
    </div>
  );
};

export default EmergencyContacts;
