import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Botanical } from '../components/Botanical';
import { FloatingToast } from '../components/FloatingToast';
import { Icon } from '../components/Icon';
import { MediaPreview } from '../components/MediaPreview';
import { useMemory } from '../context/MemoryContext';
import { MAX_UPLOAD_FILES, type UploadedMedia } from '../types/media';
import { prepareUploadMedia, UPLOAD_ACCEPT } from '../utils/uploadMedia';

export function UploadPage() {
  const { uploads, addUpload, removeUpload } = useMemory();
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  const controller = useRef<AbortController | null>(null);
  const previewTrigger = useRef<HTMLButtonElement | null>(null);
  const [checking, setChecking] = useState('');
  const [toast, setToast] = useState('');
  const [preview, setPreview] = useState<UploadedMedia | null>(null);
  const dismissToast = useCallback(() => setToast(''), []);
  const hasSent = uploads.some(item => item.sent);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; controller.current?.abort(); };
  }, []);

  // A browser Back after a partially delivered batch must preserve its retry state.
  useEffect(() => {
    if (hasSent) navigate('/upload-summary', { replace: true });
  }, [hasSent, navigate]);

  function goBack() {
    if (window.history.state?.idx > 0) navigate(-1);
    else navigate('/', { replace: true });
  }

  async function chooseFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = '';
    if (controller.current || !files.length || hasSent) return;
    setToast('');
    const available = MAX_UPLOAD_FILES - uploads.length;
    if (files.length > available) setToast(`Choose up to ${MAX_UPLOAD_FILES} photos and videos at a time. Only the first ${available} will be added.`);
    const batch = new AbortController();
    controller.current = batch;
    try {
      for (const file of files.slice(0, available)) {
        if (batch.signal.aborted || !mounted.current) break;
        setChecking(file.name);
        try {
          const item = await prepareUploadMedia(file, batch.signal);
          if (batch.signal.aborted || !mounted.current) URL.revokeObjectURL(item.previewUrl);
          else addUpload(item, file.name);
        } catch (error) {
          if (batch.signal.aborted || !mounted.current) break;
          setToast(`${file.name}: ${error instanceof Error ? error.message : 'We couldn’t prepare this file. Please choose another.'}`);
        }
      }
    } finally {
      controller.current = null;
      if (mounted.current) {
        setChecking('');
      }
    }
  }

  return (
    <main className="summary-page upload-page" aria-label="Upload wedding memories">
      <div className="summary-decoration" aria-hidden="true"><Botanical className="summary-botanical" /></div>
      <div className="summary-form">
        <div className="summary-content upload-content">
          <div className="summary-topline">
            <button type="button" className="retake-button" onClick={goBack}><Icon name="arrow" /> Back</button>
            <span className="couple-name">Raihan <span>&</span> Aiman</span>
          </div>
          <header className="upload-heading"><span className="eyebrow">MOMENTS TO TREASURE</span><h1>Share your memories.</h1><p>Add your favourite photos and videos from our day.</p></header>
          <input ref={input} className="visually-hidden" type="file" accept={UPLOAD_ACCEPT} multiple aria-label="Choose photos and videos" onChange={event => void chooseFiles(event)} disabled={!!checking || hasSent} />
          <button type="button" aria-label={uploads.length ? 'Add more photos and videos' : 'Add photos and videos'} className={`add-media-button${!uploads.length ? ' is-empty' : ''}`} onClick={() => input.current?.click()} disabled={!!checking || uploads.length >= MAX_UPLOAD_FILES || hasSent}><Icon name={uploads.length ? 'plus' : 'upload'} /><span>{uploads.length ? 'Add more photos and videos' : 'Add photos and videos'}</span><small>JPG, PNG, WebP · MP4, WebM</small></button>
          <p className="upload-limits">Up to {MAX_UPLOAD_FILES} memories · Videos up to 60 seconds and 4 MB each.</p>
          <div className="upload-checking" role="status" aria-live="polite" aria-atomic="true">{checking && <><span className="spinner" /><span>Preparing {checking}…</span><button type="button" className="retake-button" onClick={() => controller.current?.abort()}>Cancel</button></>}</div>
          {uploads.length > 0 && <>
            <div className="upload-count" role="status">{uploads.length} {uploads.length === 1 ? 'memory' : 'memories'} selected</div>
            <div className="upload-media-grid">{uploads.map(item => (
              <article className="upload-media-card" key={item.submissionId}>
                <button type="button" className="upload-preview-trigger" aria-label={`Preview ${item.filename}`} aria-haspopup="dialog" onClick={event => { previewTrigger.current = event.currentTarget; setPreview(item); }}>
                  {item.kind === 'photo' ? <img src={item.previewUrl} alt={item.filename} /> : <><video src={item.previewUrl} muted playsInline preload="metadata" aria-label={item.filename} /><span className="video-badge"><Icon name="play" /> Video</span></>}
                </button>
                <button type="button" className="remove-media-button" aria-label={`Remove ${item.filename}`} onClick={() => removeUpload(item.submissionId)} disabled={hasSent}><Icon name="close" /></button>
                <p title={item.filename}>{item.filename}</p>
              </article>
            ))}</div>
          </>}
        </div>
        <nav className="summary-actions" aria-label="Upload actions"><button className="submit-button" type="button" disabled={!uploads.length || !!checking || hasSent} onClick={() => navigate('/upload-summary')}><span>{checking ? 'Preparing your memories…' : 'Upload'}</span>{checking ? <span className="spinner" /> : <Icon name="upload" />}</button></nav>
      </div>
      {toast && <FloatingToast message={toast} onDismiss={dismissToast} />}
      {preview && <MediaPreview kind={preview.kind} src={preview.previewUrl} onClose={() => setPreview(null)} returnFocusTo={previewTrigger.current} />}
    </main>
  );
}
