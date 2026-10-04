import { useEffect, useRef, useState } from 'react';
import { useBlocker, useNavigate } from 'react-router-dom';
import { Botanical } from '../components/Botanical';
import { Icon } from '../components/Icon';
import { MediaPreview } from '../components/MediaPreview';
import { useMemory } from '../context/MemoryContext';
import { useOnline } from '../hooks/useOnline';
import { SubmissionError, submitMemory } from '../services/submit';
import { downloadMemory } from '../utils/download';
import { MAX_NAME_LENGTH, MAX_WISH_LENGTH, normalizeName, normalizeWish } from '../utils/wish';

export function SummaryPage() {
  const { media, guestName, setGuestName, wish, setWish, clearDraft } = useMemory();
  const navigate = useNavigate();
  const online = useOnline();
  const [phase, setPhase] = useState<'idle' | 'sending' | 'success'>('idle');
  const [error, setError] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const lock = useRef(false);
  const mounted = useRef(true);
  const website = useRef<HTMLInputElement>(null);
  const photoButton = useRef<HTMLButtonElement>(null);
  const blocker = useBlocker(phase === 'sending');
  const remaining = Math.max(0, Math.ceil((retryAt - now) / 1000));

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (blocker.state === 'blocked') blocker.reset();
  }, [blocker]);

  useEffect(() => {
    if (phase !== 'sending') return;
    const preventUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', preventUnload);
    return () => window.removeEventListener('beforeunload', preventUnload);
  }, [phase]);

  useEffect(() => {
    if (!retryAt) return;
    const interval = window.setInterval(() => {
      const time = Date.now();
      setNow(time);
      if (time >= retryAt) setRetryAt(0);
    }, 500);
    return () => window.clearInterval(interval);
  }, [retryAt]);

  useEffect(() => {
    if (phase !== 'success') return;
    const timer = window.setTimeout(() => {
      clearDraft();
      navigate('/', { replace: true });
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [phase, clearDraft, navigate]);

  function retake() {
    if (lock.current) return;
    clearDraft();
    navigate('/', { replace: true });
  }

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || !media || !online || Date.now() < retryAt) return;
    const name = normalizeName(guestName);
    if (name.length > MAX_NAME_LENGTH) { setError("Please keep your name to 80 characters ♡"); return; }
    const normalized = normalizeWish(wish);
    if (normalized.length > MAX_WISH_LENGTH) {
      setError('A slightly shorter wish, please — up to 800 characters ♡');
      return;
    }
    lock.current = true;
    setPhase('sending');
    setError('');
    try {
      await submitMemory(media, normalized, website.current?.value || '', name);
      if (mounted.current) {
        setPhase('success');
        try { downloadMemory(media); } catch { /* The manual Save control remains available. */ }
      }
    } catch (cause) {
      if (!mounted.current) return;
      const failure = cause instanceof SubmissionError ? cause : new SubmissionError('Please try sending your memory again ♡');
      setError(failure.message);
      if (failure.retryAfterSeconds) {
        setNow(Date.now());
        setRetryAt(Date.now() + failure.retryAfterSeconds * 1000);
      }
      setPhase('idle');
      lock.current = false;
    }
  }

  if (!media) return null;

  return (
    <main className="summary-page" aria-label={`Your ${media.kind} and wedding wish`}>
      <div className="summary-decoration" aria-hidden="true"><Botanical className="summary-botanical" /></div>
      <form className="summary-form" onSubmit={event => void submit(event)}>
        <div className="summary-content">
          <div className="summary-topline">
            <button type="button" className="retake-button" onClick={retake} disabled={phase !== 'idle'}><Icon name="arrow" /> Retake</button>
            <span className="couple-name">Raihan <span>&</span> Aiman</span>
          </div>

          <figure className="photo-frame">
            <button ref={photoButton} type="button" className="photo-preview-trigger" aria-label={media.kind === 'photo' ? 'Enlarge photo' : 'Enlarge video'} aria-haspopup="dialog" aria-controls="media-preview" onClick={() => setPreviewOpen(true)} disabled={phase !== 'idle'}>
              {media.kind === 'photo' ? <img className="captured-photo" src={media.previewUrl} alt="Your captured wedding memory" />
                : <video className="captured-photo" src={media.previewUrl} autoPlay loop muted playsInline preload="auto" aria-label="Your recorded wedding memory" />}
            </button>
          </figure>

          <div className="wish-field name-field">
            <label htmlFor="guest-name">Your name</label>
            <input id="guest-name" name="guestName" type="text" autoComplete="name" value={guestName} onChange={event => setGuestName(event.target.value)} maxLength={MAX_NAME_LENGTH} placeholder="What should we call you?" disabled={phase !== 'idle'} />
          </div>

          <div className="wish-field">
            <label htmlFor="wish">Your wedding wish</label>
            <textarea id="wish" name="wish" value={wish} onChange={event => setWish(event.target.value)} maxLength={MAX_WISH_LENGTH} rows={3} placeholder="Leave us a little wish... ✨" disabled={phase !== 'idle'} aria-describedby="wish-counter" />
            <div className="wish-footnote"><span>A few words. A lifetime of love.</span><span id="wish-counter">{wish.length} / {MAX_WISH_LENGTH}</span></div>
          </div>

          <div className="honeypot" aria-hidden="true"><label htmlFor="website">Website</label><input ref={website} type="text" id="website" name="website" tabIndex={-1} autoComplete="off" /></div>
          <div className="submission-notice" aria-live="polite" aria-atomic="true">
            {!online ? <p className="error-message">You’re offline. Your memory is still here — reconnect to send ♡</p> : error ? <p className="error-message">{error}</p> : null}
            {phase === 'sending' && <p className="sending-message">Sending your little memory…</p>}
          </div>
        </div>

        <div className="summary-actions">
          <button className="submit-button" type="submit" disabled={phase !== 'idle' || !online || remaining > 0} aria-busy={phase === 'sending'}>
            {phase === 'sending' ? <><span className="spinner" /> Sending with love…</> : phase === 'success' ? <><Icon name="check" /> Sent with love</> : remaining > 0 ? <>Try again in {remaining}s</> : <><span>Send your wish</span><Icon name="send" /></>}
          </button>
        </div>
      </form>

      {previewOpen && <MediaPreview kind={media.kind} src={media.previewUrl} onClose={() => setPreviewOpen(false)} returnFocusTo={photoButton.current} />}

      {phase === 'success' && (
        <div className="success-overlay" role="status" aria-live="polite">
          <div className="success-wreath"><Botanical /><span><Icon name="check" /></span></div>
          <span className="eyebrow">A MEMORY TO TREASURE</span>
          <h2>Sent with love ♡</h2>
          <p>Thank you for being part of our forever.</p>
          <button type="button" className="save-memory-button" onClick={() => downloadMemory(media)}>Save {media.kind}</button>
        </div>
      )}
    </main>
  );
}
