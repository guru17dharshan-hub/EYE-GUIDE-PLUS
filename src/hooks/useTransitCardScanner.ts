import { useState, useCallback, useRef } from "react";

export interface ScannedCard {
  type: "qr" | "barcode";
  rawValue: string;
  timestamp: number;
}

/**
 * Uses the BarcodeDetector API (available in Chrome/Edge/Android)
 * to scan QR codes and barcodes from camera frames.
 */
export const useTransitCardScanner = () => {
  const [lastScan, setLastScan] = useState<ScannedCard | null>(null);
  const [scanning, setScanning] = useState(false);
  const [supported, setSupported] = useState<boolean | null>(null);
  const detectorRef = useRef<any>(null);

  const initDetector = useCallback(() => {
    if (detectorRef.current) return true;
    if (typeof (window as any).BarcodeDetector === "undefined") {
      setSupported(false);
      return false;
    }
    try {
      detectorRef.current = new (window as any).BarcodeDetector({
        formats: ["qr_code", "code_128", "code_39", "ean_13", "ean_8", "itf"],
      });
      setSupported(true);
      return true;
    } catch {
      setSupported(false);
      return false;
    }
  }, []);

  /**
   * Scan a video element or canvas for barcodes/QR codes.
   * Pass the camera's video element or a captured canvas.
   */
  const scanFrame = useCallback(
    async (source: HTMLVideoElement | HTMLCanvasElement | ImageBitmap): Promise<ScannedCard | null> => {
      if (!initDetector() || !detectorRef.current) return null;

      setScanning(true);
      try {
        const barcodes = await detectorRef.current.detect(source);
        if (barcodes.length > 0) {
          const best = barcodes[0];
          const card: ScannedCard = {
            type: best.format === "qr_code" ? "qr" : "barcode",
            rawValue: best.rawValue,
            timestamp: Date.now(),
          };
          setLastScan(card);
          return card;
        }
        return null;
      } catch (e) {
        console.error("Barcode detection error:", e);
        return null;
      } finally {
        setScanning(false);
      }
    },
    [initDetector]
  );

  /**
   * Scan from a base64 data URL (e.g., from CameraFeed.captureFrame).
   */
  const scanFromDataUrl = useCallback(
    async (dataUrl: string): Promise<ScannedCard | null> => {
      if (!initDetector()) return null;

      return new Promise((resolve) => {
        const img = new Image();
        img.onload = async () => {
          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) { resolve(null); return; }
          ctx.drawImage(img, 0, 0);
          const result = await scanFrame(canvas);
          resolve(result);
        };
        img.onerror = () => resolve(null);
        img.src = dataUrl;
      });
    },
    [scanFrame, initDetector]
  );

  const clearScan = useCallback(() => setLastScan(null), []);

  return {
    lastScan,
    scanning,
    supported,
    scanFrame,
    scanFromDataUrl,
    clearScan,
  };
};
