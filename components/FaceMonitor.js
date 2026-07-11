'use client';
// components/FaceMonitor.js
// Runs face detection on the candidate's webcam video every 2 seconds.
// Calls onFlag(flagObject) when a problem is detected (no face / multiple faces).
// Requires face-api.js models to be in /public/models — see README for download instructions.

import { useEffect, useRef, useState } from 'react';

export default function FaceMonitor({ videoRef, onFlag, enabled = true }) {
  const intervalRef  = useRef(null);
  const loadedRef    = useRef(false);
  const [status, setStatus] = useState('Loading face detection…');

  // ── Load face-api.js models once ──────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return;

    async function loadModels() {
      try {
        // Dynamic import so face-api.js only loads client-side
        const faceapi = await import('face-api.js');

        // Models must live at /public/models/
        const MODEL_URL = '/models';
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
        ]);

        loadedRef.current = true;
        setStatus('Face monitoring active');

        // Start detection loop
        intervalRef.current = setInterval(async () => {
          if (!videoRef.current || !loadedRef.current) return;

          try {
            const detections = await faceapi.detectAllFaces(
              videoRef.current,
              new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 })
            );

            const count     = detections.length;
            const timestamp = new Date().toISOString();

            if (count === 0) {
              onFlag({ type: 'NO_FACE', message: 'No face detected in webcam', timestamp });
            } else if (count > 1) {
              onFlag({ type: 'MULTIPLE_FACES', message: `${count} faces detected`, timestamp });
            }
          } catch {
            // Silent — detection errors are non-fatal
          }
        }, 2000); // Every 2 seconds

      } catch (err) {
        setStatus('Face detection unavailable (models may be missing)');
        console.warn('face-api.js load error:', err);
      }
    }

    loadModels();

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [enabled, videoRef, onFlag]);

  if (!enabled) return null;

  return (
    <div className="absolute top-1 left-1 right-1 flex items-center gap-1.5 px-2 py-1 bg-black/60 rounded text-xs text-white">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${loadedRef.current ? 'bg-green-400' : 'bg-yellow-400 animate-pulse'}`} />
      <span className="truncate">{status}</span>
    </div>
  );
}
