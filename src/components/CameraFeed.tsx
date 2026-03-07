import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";

const CameraFeed = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;

    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
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

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-muted gap-4 p-8" role="alert">
        <Camera className="h-16 w-16 text-muted-foreground" aria-hidden="true" />
        <p className="text-center text-muted-foreground text-lg">{error}</p>
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      className="w-full h-full object-cover"
      aria-label="Live camera feed for navigation"
    />
  );
};

export default CameraFeed;
