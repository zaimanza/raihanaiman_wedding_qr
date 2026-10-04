async (page) => {
  await page.addInitScript(() => {
    window.__testCameraTracks = [];
    window.__testCameraRequests = [];
    window.__testCameraMode = 'ready';
    window.__testDesiredMode = 'ready';
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      window.__testCameraRequests.push(constraints);
      if (constraints.audio && constraints.video === false) {
        if (window.__microphoneDenied) throw new DOMException('Microphone denied for test', 'NotAllowedError');
        const audio = new AudioContext();
        const destination = audio.createMediaStreamDestination();
        const tone = audio.createOscillator(); tone.frequency.value = 660;
        tone.connect(destination); tone.start(); await audio.resume();
        destination.stream.getAudioTracks().forEach(track => {
          const stop = track.stop.bind(track);
          let stopped = false;
          track.stop = () => { if (stopped) return; stopped = true; stop(); tone.stop(); void audio.close(); };
        });
        window.__testMicrophone = destination.stream;
        return destination.stream;
      }
      if (window.__testCameraMode === 'denied') throw new DOMException('Denied for test', 'NotAllowedError');
      if (window.__testCameraMode === 'missing') throw new DOMException('Missing for test', 'NotFoundError');
      const requested = constraints.video?.deviceId?.exact;
      const facing = requested === 'front-test' || constraints.video?.facingMode?.exact === 'user' || constraints.video?.facingMode?.ideal === 'user' ? 'user' : 'environment';
      const canvas = document.createElement('canvas');
      canvas.width = 1440; canvas.height = 1920;
      const context = canvas.getContext('2d');
      const paint = () => {
        const gradient = context.createLinearGradient(0, 0, 1440, 1920);
        gradient.addColorStop(0, '#789581'); gradient.addColorStop(1, '#283c30');
        context.fillStyle = gradient; context.fillRect(0, 0, 1440, 1920);
        context.fillStyle = '#e7e3cb'; context.beginPath(); context.arc(800, 850, 280, 0, Math.PI * 2); context.fill();
        context.fillStyle = '#283c30'; context.font = '60px sans-serif'; context.fillText('CAMERA TEST', 570, 850);
        context.font = '38px sans-serif'; context.fillText('Simulated preview', 570, 915);
      };
      paint();
      const stream = canvas.captureStream(5);
      const track = stream.getVideoTracks()[0];
      const interval = setInterval(paint, 200);
      const stop = track.stop.bind(track);
      track.stop = () => { clearInterval(interval); stop(); };
      track.getSettings = () => ({ facingMode: facing, deviceId: facing === 'user' ? 'front-test' : 'rear-test', width: 1440, height: 1920 });
      track.getCapabilities = () => ({ facingMode: ['environment', 'user'] });
      window.__testCameraTracks.push(track);
      if (window.__testCameraMode === 'delayed') await new Promise(resolve => setTimeout(resolve, 800));
      return stream;
    };
    navigator.mediaDevices.enumerateDevices = async () => [
      { kind: 'videoinput', deviceId: 'rear-test', label: 'Rear camera' },
      { kind: 'videoinput', deviceId: 'front-test', label: 'Front camera' },
    ];
  });
  await page.goto('http://localhost:5173/summary');
  await page.getByRole('button', { name: 'Take photo' }).waitFor({state: 'visible'});
  await page.waitForFunction(() => !document.querySelector('.shutter').disabled);
  console.log('Direct summary redirected:', new URL(page.url()).pathname === '/');
}
