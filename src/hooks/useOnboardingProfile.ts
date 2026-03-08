import { useState, useCallback } from "react";

export interface UserProfile {
  name: string;
  mobilityAid: "cane" | "guide_dog" | "neither" | "";
  homeAddress: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  setupComplete: boolean;
}

const STORAGE_KEY = "eyeguide_profile";

const defaultProfile: UserProfile = {
  name: "",
  mobilityAid: "",
  homeAddress: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  setupComplete: false,
};

export const getStoredProfile = (): UserProfile => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return defaultProfile;
};

export const useOnboardingProfile = () => {
  const [profile, setProfile] = useState<UserProfile>(getStoredProfile);

  const updateProfile = useCallback((updates: Partial<UserProfile>) => {
    setProfile((prev) => {
      const next = { ...prev, ...updates };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const completeSetup = useCallback(() => {
    updateProfile({ setupComplete: true });
  }, [updateProfile]);

  return { profile, updateProfile, completeSetup };
};
