'use strict';
// Runs in the hidden capture window. Only active while a phone is watching.
const PRESETS = {
  low: { w: 960, fps: 8, jpeg: 0.5, kbps: 600 },
  medium: { w: 1280, fps: 12, jpeg: 0.62, kbps: 1500 },
  high: { w: 1920, fps: 20, jpeg: 0.78, kbps: 4500 },
  auto: { w: 1600, fps: 15, jpeg: 0.66, kbps: 2800 },
};
const video = document.getElementById('v'); const canvas = document.getElementById('c'); const ctx = canvas.getContext('2d');
let pendingIce = [], stream = null, pc = null, mode = 'idle', quality = 'auto', ice = [], gen = 0, newFrame = true, autoScale = 1, srcW = 1920;

const preset = () => PRESETS[quality] || PRESETS.auto;

async function start(m) {
  await stop(true); pendingIce = []; gen++; const my = gen; quality = m.quality; ice = m.ice || []; srcW = m.width || 1920;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { mandatory: {
      chromeMediaSource: 'desktop', chromeMediaSourceId: m.sourceId, maxWidth: m.width, maxHeight: m.height, maxFrameRate: 30 } } });
  } catch (e) { pmCap.state({ state: 'error', message: 'Screen capture failed: ' + e.message }); return; }
  if (my !== gen) { stream.getTracks().forEach((t) => t.stop()); return; }
  const track = stream.getVideoTracks()[0]; try { track.contentHint = 'detail'; } catch { /* */ }
  video.srcObject = stream; await video.play().catch(() => {});
  if ('requestVideoFrameCallback' in video) { const tick = () => { newFrame = true; if (stream) video.requestVideoFrameCallback(tick); }; video.requestVideoFrameCallback(tick); }
  mode = 'webrtc'; pmCap.state({ state: 'webrtc' });
  await startPeer(my);
}

async function startPeer(my) {
  pc = new RTCPeerConnection({ iceServers: ice });
  stream.getTracks().forEach((t) => pc.addTrack(t, stream));
  pc.onicecandidate = (e) => { if (e.candidate) pmCap.signal({ kind: 'ice', cand: e.candidate.toJSON() }); };
  const offer = await pc.createOffer(); if (my !== gen) return;
  await pc.setLocalDescription(offer); await applyQuality();
  pmCap.signal({ kind: 'offer', sdp: offer.sdp });
}

async function applyQuality() {
  if (!pc) return; const p = preset();
  for (const s of pc.getSenders()) {
    if (!s.track || s.track.kind !== 'video') continue;
    const params = s.getParameters(); if (!params.encodings || !params.encodings.length) params.encodings = [{}];
    const e = params.encodings[0]; e.maxBitrate = p.kbps * 1000; e.maxFramerate = p.fps; e.scaleResolutionDownBy = Math.max(1, srcW / p.w);
    try { await s.setParameters(params); } catch { /* not fatal */ }
  }
}

async function loop(my) {
  let okRun = 0; let lastSent = 0;
  while (my === gen && mode === 'relay' && stream) {
    const t0 = performance.now(); const p = preset();
    if (video.videoWidth && (newFrame || t0 - lastSent > 2000)) {
      newFrame = false;
      const scale = Math.min(1, p.w / video.videoWidth) * (quality === 'auto' ? autoScale : 1);
      const cw = Math.max(320, Math.round(video.videoWidth * scale)), ch = Math.round(video.videoHeight * scale * (cw / (video.videoWidth * scale)));
      if (canvas.width !== cw) { canvas.width = cw; canvas.height = ch; }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', p.jpeg));
      if (blob && my === gen) {
        const sent = await pmCap.frame(await blob.arrayBuffer()); lastSent = performance.now();
        if (quality === 'auto') { if (!sent) { autoScale = Math.max(0.4, autoScale * 0.85); okRun = 0; } else if (++okRun > 15) { autoScale = Math.min(1, autoScale * 1.1); okRun = 0; } }
        if (!sent) await new Promise((r) => setTimeout(r, 120));
      }
    }
    const wait = Math.max(8, 1000 / p.fps - (performance.now() - t0)); await new Promise((r) => setTimeout(r, wait));
  }
}

function fallback() {
  if (mode === 'relay' || !stream) return;
  if (pc) { try { pc.close(); } catch { /* */ } pc = null; }
  mode = 'relay'; autoScale = 1; pmCap.state({ state: 'relay' }); loop(gen);
}

async function stop(quiet) {
  gen++; mode = 'idle';
  if (pc) { try { pc.close(); } catch { /* */ } pc = null; }
  if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
  video.srcObject = null;
  if (!quiet) pmCap.state({ state: 'stopped' });
}

pmCap.on(async (m) => {
  try {
    switch (m.cmd) {
      case 'start': await start(m); break;
      case 'stop': await stop(false); break;
      case 'quality': quality = m.quality; autoScale = 1; await applyQuality(); break;
      case 'fallback': fallback(); break;
      case 'signal':
        if (!pc) break;
        if (m.kind === 'answer') { await pc.setRemoteDescription({ type: 'answer', sdp: m.sdp }); for (const c of pendingIce.splice(0)) await pc.addIceCandidate(c).catch(() => {}); }
        else if (m.kind === 'ice') { if (pc.remoteDescription) await pc.addIceCandidate(m.cand); else pendingIce.push(m.cand); }
        break;
      default: break;
    }
  } catch (e) { pmCap.state({ state: 'error', message: String(e.message || e) }); }
});
