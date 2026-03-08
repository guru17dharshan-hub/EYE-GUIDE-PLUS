import { useState, useEffect, useCallback } from "react";

export interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
}

const STORAGE_KEY = "eyeguide-emergency-contacts";

export const useEmergencyContacts = () => {
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setContacts(JSON.parse(stored));
    } catch {
      // ignore
    }
  }, []);

  const save = useCallback((updated: EmergencyContact[]) => {
    setContacts(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }, []);

  const addContact = useCallback(
    (name: string, phone: string) => {
      const trimmedName = name.trim().slice(0, 100);
      const trimmedPhone = phone.replace(/[^\d+\-\s()]/g, "").trim().slice(0, 20);
      if (!trimmedName || !trimmedPhone) return;
      const contact: EmergencyContact = {
        id: crypto.randomUUID(),
        name: trimmedName,
        phone: trimmedPhone,
      };
      save([...contacts, contact]);
    },
    [contacts, save]
  );

  const removeContact = useCallback(
    (id: string) => {
      save(contacts.filter((c) => c.id !== id));
    },
    [contacts, save]
  );

  const callContact = useCallback((contact: EmergencyContact) => {
    const tel = contact.phone.replace(/[^\d+]/g, "");
    window.open(`tel:${encodeURIComponent(tel)}`, "_self");
  }, []);

  const callAll = useCallback(() => {
    if (contacts.length > 0) {
      const tel = contacts[0].phone.replace(/[^\d+]/g, "");
      window.open(`tel:${encodeURIComponent(tel)}`, "_self");
    }
  }, [contacts]);

  return { contacts, addContact, removeContact, callContact, callAll };
};
