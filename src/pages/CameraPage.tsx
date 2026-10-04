import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { WeddingFrame } from '../components/WeddingFrame';
import { Icon } from '../components/Icon';
import { usePhoto } from '../context/PhotoContext';
import { useCamera } from '../hooks/useCamera';
import { capturePhoto } from '../utils/image';

export function CameraPage() {
  const navigate = useNavigate();
  const { savePhoto, clearDraft } = usePhoto();
  const { videoRef, status, error, mirrored, canSwitch, switchCamera, retry, onVideoReady } = useCamera();
  const [capturing, setCapturing] = useState(false);
  const [captureError, setCaptureError] = useState('');
  const captureLock = useRef(false);
  const frameRef = useRef<HTMLImageElement>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    clearDraft();
    return () => { mounted.current = false; };
  }, [clearDraft]);

  async function capture() {
    if (captureLock.current || status !== 'ready' || !videoRef.current) return;
    captureLock.current = true;
    setCapturing(true);
    setCaptureError('');
    try {
      if (!frameRef.current) throw new Error('Wedding frame is not ready');
      const blob = await capturePhoto(videoRef.current, mirrored, frameRef.current);
      if (!mounted.current) return;
      savePhoto(blob);
      navigate('/summary');
    } catch {
      if (mounted.current) setCaptureError('We missed that little moment. Please try taking it again ♡');
    } finally {
      captureLock.current = false;
      if (mounted.current) setCapturing(false);
    }
  }

  return (
    <main className={`camera-page${capturing ? ' is-capturing' : ''}`} aria-label="Wedding camera">
      <video ref={videoRef} className={`camera-preview${mirrored ? ' is-mirrored' : ''}`} autoPlay playsInline muted onLoadedData={onVideoReady} onCanPlay={onVideoReady} aria-label="Live camera preview" />
      <div className="camera-shade" aria-hidden="true" />
      <WeddingFrame imageRef={frameRef} />
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

      <div className="camera-controls">
        <button className="shutter" type="button" aria-label={capturing ? 'Preparing your photo' : 'Take photo'} onClick={() => void capture()} disabled={status !== 'ready' || capturing}>
          <span className="shutter-core">{capturing && <span className="spinner" />}</span>
        </button>
        <button className="switch-camera" type="button" aria-label="Switch front and rear cameras" onClick={switchCamera} disabled={status !== 'ready' || capturing || !canSwitch}>
          <Icon name="switch" />
        </button>
      </div>
      <div className="camera-flash" aria-hidden="true" />
    </main>
  );
}
