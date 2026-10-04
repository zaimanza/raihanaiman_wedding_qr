import { useEffect, useRef, useState, type PointerEvent, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Botanical } from '../components/Botanical';
import { Icon } from '../components/Icon';
import { useMemory } from '../context/MemoryContext';
import { useCamera } from '../hooks/useCamera';
import { decoratePhoto } from '../utils/weddingArt';
import { capturePhoto, preparePhotoForUpload } from '../utils/image';
import { HOLD_TO_RECORD_MS, MAX_RECORDING_MS, recordingMimeType, recordVideo, type RecordingSession } from '../utils/recording';

export function CameraPage() {
  const navigate = useNavigate();
  const { saveMedia, clearDraft } = useMemory();
  const { videoRef, status, error, mirrored, canSwitch, switchCamera, retry, onVideoReady } = useCamera();
  const [capturing, setCapturing] = useState(false);
  const [captureError, setCaptureError] = useState('');
  const [requestingAudio, setRequestingAudio] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const captureLock = useRef(false);
  const mounted = useRef(true);
  const held = useRef(false);
  const holdTimer = useRef<number | undefined>(undefined);
  const session = useRef<RecordingSession | null>(null);
  const clock = useRef<number | undefined>(undefined);
  const canRecord = recordingMimeType() !== null && typeof HTMLCanvasElement.prototype.captureStream === 'function';

  function clearHold() { held.current = false; window.clearTimeout(holdTimer.current); }
  function cancelRecording() {
    clearHold();
    session.current?.cancel();
    session.current = null;
    window.clearInterval(clock.current);
  }

  useEffect(() => {
    mounted.current = true;
    clearDraft();
    const onHidden = () => { if (document.visibilityState === 'hidden') cancelRecording(); };
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', cancelRecording);
    return () => {
      mounted.current = false;
      cancelRecording();
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('pagehide', cancelRecording);
    };
  }, [clearDraft]);

  async function capture() {
    if (captureLock.current || status !== 'ready' || !videoRef.current) return;
    captureLock.current = true;
    setCapturing(true);
    setCaptureError('');
    try {
      const original = await capturePhoto(videoRef.current, mirrored);
      const downloadBlob = await decoratePhoto(original);
      const blob = await preparePhotoForUpload(original);
      if (!mounted.current) return;
      saveMedia(blob, 'photo', downloadBlob);
      navigate('/summary');
    } catch {
      if (mounted.current) setCaptureError('We missed that little moment. Please try taking it again ♡');
    } finally {
      captureLock.current = false;
      if (mounted.current) setCapturing(false);
    }
  }

  async function startRecording() {
    if (!held.current || captureLock.current || status !== 'ready' || !videoRef.current) return;
    captureLock.current = true;
    setCaptureError('');
    setRequestingAudio(true);
    let microphone: MediaStream | undefined;
    try {
      microphone = await navigator.mediaDevices.getUserMedia({video:false, audio:{echoCancellation:true,noiseSuppression:true}});
      if (!mounted.current || !held.current || document.visibilityState === 'hidden' || !videoRef.current) {
        microphone.getTracks().forEach(track => track.stop());
        captureLock.current = false;
        if (mounted.current) setRequestingAudio(false);
        return;
      }
      setRequestingAudio(false);
      const current = recordVideo(videoRef.current, mirrored, microphone);
      session.current = current;
      setRecording(true);
      setElapsed(0);
      const started = performance.now();
      clock.current = window.setInterval(() => setElapsed(Math.min(MAX_RECORDING_MS / 1000, Math.floor((performance.now() - started) / 1000))), 200);
      void current.result.then(({blob, downloadBlob}) => {
        if (!mounted.current || session.current !== current) return;
        saveMedia(blob, 'video', downloadBlob);
        navigate('/summary');
      }).catch(() => {
        if (mounted.current && session.current === current) setCaptureError('We couldn’t finish this video. Hold to try again ♡');
      }).finally(() => {
        clearHold();
        window.clearInterval(clock.current);
        session.current = null;
        captureLock.current = false;
        if (mounted.current) { setRecording(false); setCapturing(false); }
      });
    } catch {
      clearHold();
      captureLock.current = false;
      microphone?.getTracks().forEach(track => track.stop());
      if (mounted.current) {
        setRequestingAudio(false);
        setCaptureError('Please allow microphone access to record a video with sound. Hold to try again ♡');
      }
    }
  }

  function pressShutter() {
    if (captureLock.current || status !== 'ready' || held.current) return;
    held.current = true;
    if (canRecord) holdTimer.current = window.setTimeout(startRecording, HOLD_TO_RECORD_MS);
  }
  function releaseShutter() {
    const wasHeld = held.current;
    clearHold();
    if (session.current) { setCapturing(true); session.current.stop(); }
    else if (wasHeld && !captureLock.current) void capture();
  }
  function pointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (!event.isPrimary || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pressShutter();
  }
  function keyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    if (!event.repeat) pressShutter();
  }

  return (
    <main className={`camera-page${capturing && !recording ? ' is-capturing' : ''}`} aria-label="Wedding camera">
      <video ref={videoRef} className={`camera-preview${mirrored ? ' is-mirrored' : ''}`} autoPlay playsInline muted onLoadedData={onVideoReady} onCanPlay={onVideoReady} aria-label="Live camera preview" />
      <div className="camera-shade" aria-hidden="true" />
      <Botanical className="camera-botanical camera-botanical-top" />
      <Botanical className="camera-botanical camera-botanical-bottom" />
      <div className="camera-wedding-title" aria-hidden="true"><span>Raihan &amp; Aiman</span><small>Wedding · 11 Oct 2026</small></div>
      <div className="camera-specks" aria-hidden="true"><i /><i /><i /></div>
      {status !== 'ready' && (
        <div className="camera-state" role="status" aria-live="polite">
          <div className="camera-state-icon"><Icon name="camera" /></div>
          {status === 'requesting' ? <><h1>A little moment awaits.</h1><p>Opening your camera…</p><span className="spinner" aria-hidden="true" /></>
            : status === 'paused' ? <><h1>Whenever you’re ready.</h1><p>Your camera is resting.</p></>
              : <><h1>Let’s capture a memory.</h1><p>{error}</p><button type="button" className="camera-retry" onClick={retry}><Icon name="retry" /> Try again</button></>}
        </div>
      )}
      {captureError && <div className="camera-notice" role="alert">{captureError}</div>}
      {requestingAudio && <div className="camera-notice" role="status">Opening your microphone…</div>}
      {recording && <div className="recording-status" role="status" aria-live="polite"><span aria-hidden="true" /> Recording · {elapsed}s / {MAX_RECORDING_MS / 1000}s</div>}
      {status === 'ready' && canRecord && !captureError && !recording && <p id="shutter-hint" className="shutter-hint">Tap for photo · Hold for video</p>}
      <div className="camera-controls">
        <button className={`shutter${recording ? ' is-recording' : ''}`} type="button" aria-label={recording ? 'Stop recording' : capturing ? 'Preparing your memory' : 'Take photo'} aria-describedby={canRecord && !recording && !captureError ? 'shutter-hint' : undefined}
          onPointerDown={pointerDown} onPointerUp={releaseShutter} onPointerCancel={cancelRecording}
          onLostPointerCapture={() => { if (held.current) cancelRecording(); }} onContextMenu={event => event.preventDefault()}
          onKeyDown={keyDown} onKeyUp={event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); releaseShutter(); } }}
          onClick={event => { if (event.detail === 0 && !held.current) { if (session.current) session.current.stop(); else void capture(); } }} disabled={status !== 'ready' || capturing}>
          <span className="shutter-core">{capturing && <span className="spinner" />}</span>
        </button>
        <button className="switch-camera" type="button" aria-label="Switch front and rear cameras" onClick={switchCamera} disabled={status !== 'ready' || capturing || recording || requestingAudio || !canSwitch}><Icon name="switch" /></button>
      </div>
      <div className="camera-flash" aria-hidden="true" />
    </main>
  );
}
