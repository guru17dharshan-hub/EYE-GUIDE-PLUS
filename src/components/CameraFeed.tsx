import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from "react";
import { Camera } from "lucide-react";

export interface CameraFeedRef {
  captureFrame: () => string | null;
}

const CameraFeed = forwardRef<CameraFeedRef>((_, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;

    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: 640, height: 480 },
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch {
        setError("Camera access denied. Grant permission to use navigation.");
      }
    };

    startCamera();

    return () => {
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return null;

    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, 640, 480);
    return canvas.toDataURL("image/jpeg", 0.6);
  }, []);

  useImperativeHandle(ref, () => ({ captureFrame }), [captureFrame]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-muted gap-4 p-8" role="alert">
        <Camera className="h-16 w-16 text-muted-foreground" aria-hidden="true" />
        <p className="text-center text-muted-foreground text-lg">{error}</p>
      </div>
    );
  }

  return (
    <>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover"
        aria-label="Live camera feed for navigation"
      />
      <canvas ref={canvasRef} className="hidden" />
    </>
  );
});

CameraFeed.displayName = "CameraFeed";

export default CameraFeed;
