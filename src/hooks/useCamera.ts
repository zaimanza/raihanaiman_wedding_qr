import { useCallback, useEffect, useRef, useState } from 'react';

export type CameraStatus = 'requesting' | 'ready' | 'error' | 'paused';
type Facing = 'environment' | 'user';

// A permission prompt cannot be cancelled. Serialize acquisitions across mounts
// so an old, newly approved request is stopped before another opens a camera.
let cameraRequestQueue: Promise<void> = Promise.resolve();

function enqueueCameraRequest(operation: () => Promise<void>): Promise<void> {
  const request = cameraRequestQueue.then(operation, operation);
  cameraRequestQueue = request.then(() => undefined, () => undefined);
  return request;
}

function stopTracks(stream: MediaStream) {
  for (const track of stream.getTracks()) track.stop();
}

function cameraErrorMessage(cause: unknown): string {
  const name = cause instanceof Error ? cause.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return 'We need camera access to capture this little memory ♡ Allow it in your browser settings, then try again.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'We couldn’t find a camera. Open this link on a phone or connect a camera, then try again ♡';
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return 'Your camera may be busy. Close other apps using it, then try again ♡';
    case 'OverconstrainedError':
      return 'This camera isn’t available right now. Please try again ♡';
    default:
      return 'We couldn’t open your camera just yet. Please try again ♡';
  }
}

function getFacing(track: MediaStreamTrack): Facing | undefined {
  const facing = track.getSettings().facingMode;
  return facing === 'user' || facing === 'environment' ? facing : undefined;
}

function getFacingCapabilities(track: MediaStreamTrack): string[] {
  // Older mobile browsers may not implement getCapabilities.
  try {
    return track.getCapabilities?.().facingMode ?? [];
  } catch {
    return [];
  }
}

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const removeTrackListenersRef = useRef<(() => void) | null>(null);
  const requestIdRef = useRef(0);
  const desiredFacingRef = useRef<Facing>('environment');
  const desiredDeviceRef = useRef<string | undefined>(undefined);
  const actualFacingRef = useRef<Facing | undefined>(undefined);
  const capabilitiesRef = useRef<string[]>([]);
  const devicesRef = useRef<MediaDeviceInfo[]>([]);
  const currentDeviceRef = useRef<string | undefined>(undefined);
  const statusRef = useRef<CameraStatus>('requesting');
  const canSwitchRef = useRef(false);
  const [status, setStatus] = useState<CameraStatus>('requesting');
  const [error, setError] = useState<string | null>(null);
  const [mirrored, setMirrored] = useState(false);
  const [canSwitch, setCanSwitch] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const updateStatus = useCallback((next: CameraStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const releaseCamera = useCallback(() => {
    removeTrackListenersRef.current?.();
    removeTrackListenersRef.current = null;
    const stream = streamRef.current;
    streamRef.current = null;
    if (stream) stopTracks(stream);
    const video = videoRef.current;
    if (video && (!stream || video.srcObject === stream)) {
      video.pause();
      video.srcObject = null;
    }
  }, []);

  const onVideoReady = useCallback(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (
      statusRef.current === 'requesting' &&
      document.visibilityState !== 'hidden' &&
      video && stream && video.srcObject === stream &&
      video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0 &&
      stream.getVideoTracks().some((track) => track.readyState === 'live')
    ) {
      setError(null);
      updateStatus('ready');
    }
  }, [updateStatus]);

  const retry = useCallback(() => {
    // Invalidate immediately; an already resolving request must not attach
    // between the button press and React running the replacement effect.
    requestIdRef.current += 1;
    releaseCamera();
    setError(null);
    updateStatus(document.visibilityState === 'hidden' ? 'paused' : 'requesting');
    setAttempt((value) => value + 1);
  }, [releaseCamera, updateStatus]);

  const switchCamera = useCallback(() => {
    if (!canSwitchRef.current || statusRef.current !== 'ready') return;
    const currentFacing = actualFacingRef.current ?? desiredFacingRef.current;
    const nextFacing: Facing = currentFacing === 'environment' ? 'user' : 'environment';
    desiredFacingRef.current = nextFacing;

    const devices = devicesRef.current;
    const oppositeLabel = nextFacing === 'user'
      ? /front|user|facetime/i
      : /back|rear|environment/i;
    const opposite = devices.find((device) =>
      device.deviceId !== currentDeviceRef.current && oppositeLabel.test(device.label),
    );

    // Mobile cameras usually expose facingMode. For external/desktop webcams
    // without it, cycle actual device IDs instead of repeating the same camera.
    if (opposite) {
      desiredDeviceRef.current = opposite.deviceId;
    } else if (!actualFacingRef.current && devices.length > 1) {
      const currentIndex = devices.findIndex((device) => device.deviceId === currentDeviceRef.current);
      desiredDeviceRef.current = devices[(currentIndex + 1) % devices.length]?.deviceId;
    } else {
      desiredDeviceRef.current = undefined;
    }
    retry();
  }, [retry]);

  useEffect(() => {
    let disposed = false;
    let paused = document.visibilityState === 'hidden';
    let resumeScheduled = false;
    const requestId = ++requestIdRef.current;
    const isCurrent = () => !disposed && !paused &&
      requestIdRef.current === requestId && document.visibilityState !== 'hidden';

    const pauseCamera = () => {
      if (disposed) return;
      paused = true;
      resumeScheduled = false;
      requestIdRef.current += 1;
      releaseCamera();
      updateStatus('paused');
    };
    const resumeCamera = () => {
      if (disposed || document.visibilityState === 'hidden' || resumeScheduled || !paused) return;
      resumeScheduled = true;
      setAttempt((value) => value + 1);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') pauseCamera();
      else resumeCamera();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', pauseCamera);
    window.addEventListener('pageshow', resumeCamera);

    const cleanup = () => {
      disposed = true;
      if (requestIdRef.current === requestId) requestIdRef.current += 1;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', pauseCamera);
      window.removeEventListener('pageshow', resumeCamera);
      releaseCamera();
    };

    if (paused) {
      updateStatus('paused');
      return cleanup;
    }
    setError(null);
    updateStatus('requesting');
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError(!window.isSecureContext
        ? 'Open this wedding camera using its secure HTTPS link ♡'
        : 'This browser can’t open a camera. Try this link in Safari or Chrome ♡');
      updateStatus('error');
      return cleanup;
    }

    const mediaDevices = navigator.mediaDevices;
    const acquire = async () => {
      if (!isCurrent()) return;
      const facing = desiredFacingRef.current;
      const deviceId = desiredDeviceRef.current;
      const bothFacings = capabilitiesRef.current.includes('user') &&
        capabilitiesRef.current.includes('environment');
      const strictFacing = bothFacings || (
        !!actualFacingRef.current && devicesRef.current.length > 1 &&
        mediaDevices.getSupportedConstraints?.().facingMode === true
      );
      const constraints: MediaStreamConstraints = {
        audio: false,
        video: {
          width: { ideal: 3840 },
          height: { ideal: 2160 },
          frameRate: { ideal: 30, max: 30 },
          ...(deviceId
            ? { deviceId: { exact: deviceId } }
            : { facingMode: strictFacing ? { exact: facing } : { ideal: facing } }),
        },
      };

      try {
        let stream: MediaStream;
        try {
          stream = await mediaDevices.getUserMedia(constraints);
        } catch (cause) {
          if (!isCurrent()) return;
          // Only retry constraint failures, never denied permission or a busy
          // camera. The fallback still requests no microphone access.
          if (!(cause instanceof Error) || cause.name !== 'OverconstrainedError') throw cause;
          stream = await mediaDevices.getUserMedia({ video: true, audio: false });
        }
        if (!isCurrent()) {
          stopTracks(stream);
          return;
        }
        const video = videoRef.current;
        const track = stream.getVideoTracks()[0];
        if (!video || !track || track.readyState !== 'live') {
          stopTracks(stream);
          throw new Error('Camera preview is unavailable');
        }
        streamRef.current = stream;
        actualFacingRef.current = getFacing(track);
        if (actualFacingRef.current) desiredFacingRef.current = actualFacingRef.current;
        currentDeviceRef.current = track.getSettings().deviceId;
        // If a selected device disappeared and the constraint fallback picked
        // another camera, use the working device on a later resume/retry.
        if (deviceId) desiredDeviceRef.current = currentDeviceRef.current;
        capabilitiesRef.current = getFacingCapabilities(track);
        setMirrored(actualFacingRef.current === 'user');

        const onEnded = () => {
          if (!isCurrent() || streamRef.current !== stream) return;
          releaseCamera();
          setError('Your camera connection was interrupted. Please try again ♡');
          updateStatus('error');
        };
        track.addEventListener('ended', onEnded);
        removeTrackListenersRef.current = () => track.removeEventListener('ended', onEnded);
        video.srcObject = stream;
        // These properties are also present in the page's video markup, but
        // setting them before play helps older iPhone Safari versions.
        video.muted = true;
        video.playsInline = true;
        video.autoplay = true;
        void video.play().then(() => {
          if (isCurrent() && streamRef.current === stream) onVideoReady();
        }).catch(() => {
          if (!isCurrent() || streamRef.current !== stream) return;
          releaseCamera();
          setError('Tap Try again to start your camera ♡');
          updateStatus('error');
        });

        const updateSwitchAvailability = () => {
          const available = devicesRef.current.length > 1 || (
            capabilitiesRef.current.includes('user') && capabilitiesRef.current.includes('environment')
          );
          canSwitchRef.current = available;
          setCanSwitch(available);
        };
        updateSwitchAvailability();
        // Enumeration failure must not turn a successfully granted camera
        // into an error. Permission often makes device names available here.
        void Promise.resolve().then(() => mediaDevices.enumerateDevices()).then((devices) => {
          if (!isCurrent() || streamRef.current !== stream) return;
          devicesRef.current = devices.filter((device) => device.kind === 'videoinput' && device.deviceId);
          updateSwitchAvailability();
        }).catch(() => undefined);
      } catch (cause) {
        if (!isCurrent()) return;
        releaseCamera();
        setError(cameraErrorMessage(cause));
        updateStatus('error');
      }
    };
    void enqueueCameraRequest(acquire).catch((cause) => {
      if (!isCurrent()) return;
      releaseCamera();
      setError(cameraErrorMessage(cause));
      updateStatus('error');
    });
    return cleanup;
  }, [attempt, onVideoReady, releaseCamera, updateStatus]);

  return { videoRef, status, error, mirrored, canSwitch, switchCamera, retry, onVideoReady };
}
