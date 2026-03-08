/**
 * Progressive haptic feedback utilities.
 * Vibration intensity/frequency scales with proximity.
 */

/** Returns a vibration pattern that gets more intense as distance decreases */
export const getProximityVibration = (distanceMeters: number): number[] => {
  if (distanceMeters <= 30) {
    // Very close — rapid triple buzz
    return [100, 50, 100, 50, 100];
  }
  if (distanceMeters <= 80) {
    // Close — strong double buzz
    return [200, 80, 200];
  }
  if (distanceMeters <= 150) {
    // Medium — moderate single buzz
    return [250];
  }
  if (distanceMeters <= 300) {
    // Far — light pulse
    return [150];
  }
  // Very far — gentle tap
  return [80];
};

/** 
 * Starts a repeating haptic pulse that gets faster as distance shrinks.
 * Returns a cleanup function to stop the loop.
 */
export const startProximityPulse = (
  getDistance: () => number,
  enabled: () => boolean
): (() => void) => {
  let timerId: ReturnType<typeof setTimeout> | null = null;

  const pulse = () => {
    if (!enabled() || !navigator.vibrate) return;
    const dist = getDistance();
    const pattern = getProximityVibration(dist);
    navigator.vibrate(pattern);

    // Schedule next pulse — interval scales with distance
    const interval = dist <= 50 ? 800 : dist <= 150 ? 1500 : dist <= 300 ? 3000 : 5000;
    timerId = setTimeout(pulse, interval);
  };

  pulse();

  return () => {
    if (timerId) clearTimeout(timerId);
    if (navigator.vibrate) navigator.vibrate(0); // stop vibration
  };
};

/** Phase-specific haptic patterns for boarding */
export const getBoardingHaptic = (phase: string): number[] => {
  switch (phase) {
    case "detected":
      return [200, 100, 200];
    case "approaching":
      return [150, 80, 150, 80, 150];
    case "boarding":
      return [300, 100, 300, 100, 300];
    case "finding_seat":
      return [100, 50, 100];
    case "seated":
      return [100];
    case "exiting":
      return [400, 150, 400, 150, 400]; // Urgent — prepare to move
    case "post_exit":
      return [200, 100, 200]; // Confirmation pulse
    default:
      return [150];
  }
};
