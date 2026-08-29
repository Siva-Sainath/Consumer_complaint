let saved = null;
try { saved = JSON.parse(localStorage.getItem('consumer-copilot-demo') || 'null'); } catch { localStorage.removeItem('consumer-copilot-demo'); }
const state = saved || { fields:{}, messages:0, voicePhase:'IDLE', submitted:false, docket:'', location:null };
const $ = (id) => document.getElementById(id);
const conversation = $('conversation'), input = $('messageInput'), suggestions = $('suggestions');
const VOICE_PHASES = new Set(['IDLE','LISTENING','TRANSCRIBING','THINKING','SPEAKING']);
function setVoicePhase(phase) {
  state.voicePhase = VOICE_PHASES.has(phase) ? phase : 'IDLE';
  document.body.dataset.voicePhase = state.voicePhase;
  const labels = {IDLE:'Ready to listen', LISTENING:'Listening…', TRANSCRIBING:'Transcribing…', THINKING:'Thinking…', SPEAKING:'Speaking…'};
  const dot = $('statusDot');
  const label = $('statusLabel');
  if (label) label.textContent = labels[state.voicePhase] || labels.IDLE;
  if (dot) dot.classList.toggle('active', state.voicePhase !== 'IDLE');
  const mic = $('micButton');
  if (mic) {
    const canTap = state.voicePhase === 'IDLE' || state.voicePhase === 'LISTENING';
    mic.disabled = state.submitted || !canTap;
    mic.setAttribute('aria-disabled', String(mic.disabled));
  }
}
function voiceBusy() {
  return ['LISTENING', 'TRANSCRIBING', 'THINKING', 'SPEAKING'].includes(state.voicePhase);
}

const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;'
}[char]));
function persist() {
  localStorage.setItem('consumer-copilot-demo', JSON.stringify({
    fields: state.fields, messages: state.messages, submitted: state.submitted, docket: state.docket, location: state.location, speaking: state.speaking
  }));
}
function locationPhrase(text) {
  const match = text.match(/\b(?:at|near|in|from|में|पर|के पास)\s+([^,.!?]{3,70})/i);
  return match?.[1]?.trim().replace(/\s+(served|sold|gave|delivered|sent|had|was|and|but|yesterday|today|i want|कल|आज).*$/i, '') || '';
}
function detectOutOfScope(text) {
  const t = text.toLowerCase();
  if (/\brti\b|right to information/.test(t)) return 'RTI';
  if (/court|sub[\s-]?judice|judge|case hearing|litigation/.test(t)) return 'court-related matter';
  if (/foreign government|another country|embassy|visa authority/.test(t)) return 'foreign government matter';
  if (/religion|religious|temple|mosque|church|gurudwara/.test(t)) return 'religious matter';
  if (/suggestion|feature request|idea for government/.test(t)) return 'a suggestion';
  return '';
}
const scopeGuidance = {
  'RTI':'For information held by a public authority, the RTI Online portal is the better avenue.',
  'court-related matter':'Because this concerns a court or an active legal matter, please use the relevant court, tribunal, or legal-aid channel.',
  'foreign government matter':'This service covers Indian consumer matters. Please contact the relevant foreign authority or embassy.',
  'religious matter':'Religious matters are outside consumer grievance handling. Please contact the relevant institution or local authority.',
  'a suggestion':'Suggestions are not consumer grievances. Please use the relevant department’s feedback or public consultation channel.'
};
async function findPlace(query) {
  const key = `osm:${query.toLowerCase()}`;
  const cached = JSON.parse(localStorage.getItem(key) || 'null');
  if (cached) return cached;
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=3&countrycodes=in&q=${encodeURIComponent(query)}`, {headers:{'Accept-Language':'en-IN'}});
    if (!response.ok) return [];
    const results = await response.json();
    localStorage.setItem(key, JSON.stringify(results));
    return results;
  } catch { return []; }
}
function addLocationSuggestion() {
  if (!state.location?.query) return;
  const wrap = document.createElement('div'); wrap.className='location-suggestion';
  if (state.location.result && !state.location.approved) {
    wrap.innerHTML=`<span class="location-pin">⌖</span><div><strong>${escapeHtml(state.location.result.display_name)}</strong><small>Is this the place you meant?</small></div>`;
    const approve = document.createElement('button'); approve.className='approve-location'; approve.textContent='Use this'; approve.onclick=()=>{state.location.approved=true; persist(); renderState(); showSuggestions(); addMessage(`I’ve tagged ${state.location.result.display_name} as the location.`, 'assistant');}; wrap.append(approve);
  } else if (!state.location.result && !state.location.loading) {
    const button=document.createElement('button'); button.className='suggestion photo'; button.textContent=`Find “${state.location.query}” on map`; button.onclick=async()=>{state.location.loading=true; showSuggestions(); const results=await findPlace(state.location.query); state.location.loading=false; state.location.result=results[0] || null; persist(); showSuggestions();}; wrap.append(button);
  }
  if (state.location.result && state.location.approved) {
    wrap.innerHTML=`<span class="location-pin">✓</span><div><strong>${escapeHtml(state.location.result.display_name)}</strong><small>Location tag approved by you · © OpenStreetMap contributors</small></div>`;
  }
  if (wrap.children.length) suggestions.append(wrap);
}
function addMessage(text, who='assistant') {
  const wrap = document.createElement('div'); wrap.className = `message ${who}-message`;
  const avatar = document.createElement('div'); avatar.className='avatar'; avatar.textContent = who === 'assistant' ? '✦' : 'you';
  const body = document.createElement('div'); body.innerHTML = `<p>${escapeHtml(text)}</p><span class="message-time">just now</span>`;
  wrap.append(avatar, body); conversation.append(wrap); conversation.scrollTop = conversation.scrollHeight;
}

async function speakNative(text) {
  if (!state.speaking || !('speechSynthesis' in window) || !text) return;
  window.speechSynthesis.cancel();
  const hindi = /[\u0900-\u097F]/.test(text);
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) { setTimeout(() => speak(text), 120); return; }
  const preferred = voices.find((item) => hindi && item.lang.toLowerCase().startsWith('hi')) ||
    voices.find((item) => item.lang.toLowerCase().startsWith('en-in')) ||
    voices.find((item) => /samantha|ava|karen|google uk english female/i.test(item.name)) ||
    voices.find((item) => item.lang.toLowerCase().startsWith('en')) || voices[0];
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
  sentences.forEach((sentence, index) => {
    const utterance = new SpeechSynthesisUtterance(sentence.trim());
    if (preferred) utterance.voice = preferred;
    utterance.rate = 0.88; utterance.pitch = 0.98; utterance.volume = 0.85;
    utterance.onstart = () => { if (index === 0) setVoicePhase('SPEAKING'); };
    utterance.onend = () => { if (index === sentences.length - 1) setVoicePhase('IDLE'); };
    window.speechSynthesis.speak(utterance);
  });
}
async function speak(text) {
  if (!state.speaking || !text) return;
  const plain = text.replace(/\[[^\]]+\]\s*/g, '');
  setVoicePhase('SPEAKING');
  if (!/[\u0900-\u097F]/.test(plain)) {
    try {
      const response = await fetch('/api/speak', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({text: plain})});
      if (response.ok && response.headers.get('content-type')?.includes('audio')) {
        window.speechSynthesis?.cancel();
        state.audio?.pause();
        state.audio = new Audio(URL.createObjectURL(await response.blob()));
        state.audio.onended = () => setVoicePhase('IDLE');
        await state.audio.play();
        return;
      }
    } catch {}
  }
  speakNative(plain);
}
async function callGroq(text) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);
  try {
    const response = await fetch('/api/complaint-turn', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ text, current_fields: state.fields }), signal: controller.signal
    });
    if (!response.ok) return null;
    return await response.json();
  } catch { return null; } finally { clearTimeout(timeout); }
}

function inferComplaint(text) {
  const t = text.toLowerCase();
  const next = {};
  if (/amazon|flipkart|myntra|swiggy|zomato|blinkit|seller|shop|store|company|bank|jio|airtel|service provider|restaurant|biryani|cafe|hotel/.test(t)) {
    const named = text.match(/\b(?:provider|seller|restaurant|shop|store|company|from|at)\s+(?:was\s+)?([^,.!?]+)/i);
    next.who = named?.[1]?.trim() || text.match(/amazon|flipkart|myntra|swiggy|zomato|blinkit|jio|airtel|bank|paradise[^,.!?]*/i)?.[0] || 'Seller / service provider';
  }
  if (/refund|money back|paise|₹|rs\.?\s?\d|rupees|charged|price|mrp|payment|amount/.test(t)) next.relief = /refund|money back|paise|charged|payment|amount|₹|rs\.?/i.test(t) ? 'Refund / money back' : '';
  if (/food|restaurant|expired|rotten|stale|packaged|fssai/.test(t)) next.route = 'FSSAI · food safety complaint';
  else if (/mrp|overcharg|price tag|weigh|weight|meter/.test(t)) next.route = 'Legal Metrology · overcharging / MRP';
  else if (/scam|fraud|upi|cyber|otp|online/.test(t)) next.route = 'Cyber Crime · online fraud';
  else if (Object.keys(state.fields).length || next.who) next.route = 'National Consumer Helpline · consumer grievance';
  next.what = text.length > 18 ? text.slice(0, 110) + (text.length > 110 ? '…' : '') : '';
  next.when = /yesterday|today|last week|on \d|january|february|march|april|may|june|july|august|september|october|november|december/i.test(t) ? 'Date mentioned in your story' : '';
  return next;
}

function renderState() {
  const labels = {what:'what',who:'who',when:'when',relief:'relief'};
  let filled = 0;
  Object.entries(labels).forEach(([key, field]) => {
    const el = document.querySelector(`[data-field="${field}"]`); const value = state.fields[key];
    if (value) { filled++; el.classList.add('filled'); el.classList.remove('empty'); el.querySelector('p').textContent = value; el.querySelector('.field-icon').textContent='✓'; }
  });
  const pct = filled === 0 ? 0 : Math.min(100, filled * 22 + (state.fields.route ? 8 : 0) + (state.location?.approved ? 6 : 0));
  $('progressBar').style.width = `${pct}%`; $('progressPercent').textContent = `${pct}%`;
  $('progressText').textContent = filled === 0 ? 'Ready when you are' : filled >= 4 ? 'Ready to review' : filled >= 3 ? 'Almost ready to review' : 'We’ll fill this in as you talk';
  $('routeText').textContent = state.fields.route || 'We’ll suggest the right place to raise this';
  if (state.location?.approved) { $('locationBadge').hidden=false; $('locationText').textContent=state.location.result.display_name; }
  $('stepLabel').textContent = state.submitted ? '3 of 3' : filled >= 3 ? '2 of 3' : '1 of 3';
  if (state.submitted) {
    $('trackingCard').hidden = false;
    $('docketNumber').textContent = state.docket;
    $('trackingStatus').textContent = 'Saved on this device · mock status';
  }
}

function showSuggestions() {
  suggestions.innerHTML='';
  addLocationSuggestion();
  if (state.outOfScope) {
    const restart=document.createElement('button'); restart.className='suggestion'; restart.textContent='Start a consumer complaint instead'; restart.onclick=resetDemo; suggestions.append(restart);
    return;
  }
  if (!state.fields.relief) addSuggestion('What would make this right?', ['Refund','Replacement','Just an apology']);
  if (!state.fields.photo) addSuggestion('Add a receipt or product photo', [], true);
  if (Object.keys(state.fields).filter(k=>['what','who','when','relief'].includes(k)).length >= 3 && !state.submitted) addSuggestion('Review your complaint', [], false, true);
}
function addSuggestion(label, options=[], photo=false, review=false) {
  if (options.length) options.forEach(option => { const b=document.createElement('button'); b.className='suggestion'; b.textContent=option; b.onclick=()=>{ input.value=option; send(); }; suggestions.append(b); });
  else { const b=document.createElement('button'); b.className=`suggestion ${photo?'photo':''}`; b.textContent=label; b.onclick=()=> review ? openReview() : photo ? $('photoInput').click() : null; suggestions.append(b); }
}

function respond(text) {
  const lower=text.toLowerCase(); let reply='Got it. I’m keeping the important details together.';
  if (state.outOfScope) reply=`I understand. This is ${state.outOfScope}, so the consumer grievance route isn’t the right avenue. ${scopeGuidance[state.outOfScope]} I can still help with a product or service issue.`;
  else if (!state.fields.who) reply='That sounds really frustrating. Who was the seller or service provider involved? Even an approximate name is okay.';
  else if (!state.fields.when) reply='I’ve got the issue. When and where did you buy or use the service? A rough date and city is enough for now.';
  else if (!state.fields.relief) reply='You’ve explained what went wrong. What would feel like a fair resolution — a refund, replacement, or something else?';
  else reply='This is taking shape. I’ve suggested a likely route and added a review step so you can check everything before it is “submitted”.';
  addMessage(reply);
  speak(reply);
}
function send() {
  const text=input.value.trim();
  if(!text || state.submitted || voiceBusy()) return;
  addMessage(text,'user'); input.value=''; state.messages++;
  const scope = detectOutOfScope(text);
  if (scope) { state.outOfScope=scope; state.fields.route='Outside consumer grievance scope'; }
  else if (!state.outOfScope) Object.assign(state.fields, inferComplaint(text));
  persist(); renderState(); setVoicePhase('THINKING'); respond(text); showSuggestions();
  const place = locationPhrase(text);
  if (place && !state.location?.approved) { state.location={query:place, loading:false, result:null, approved:false}; persist(); showSuggestions(); }
  callGroq(text).then((result) => {
    if (!result?.extracted_fields) { if (state.voicePhase==='THINKING') setVoicePhase('IDLE'); return; }
    Object.assign(state.fields, result.extracted_fields);
    if (result.routing && !state.outOfScope) state.fields.route = result.routing;
    state.aiMode = 'Groq enhanced';
    persist(); renderState(); showSuggestions();
    if (state.voicePhase==='THINKING') setVoicePhase('IDLE');
  });
}
function openReview() {
  if(state.submitted) return;
  const summary = Object.entries({Issue:state.fields.what, Seller:state.fields.who, 'When & where':state.fields.when, 'You want':state.fields.relief}).filter(([,v])=>v).map(([k,v])=>`<div><small>${k.toUpperCase()}</small><p>${escapeHtml(v)}</p></div>`).join('');
  const wrap=document.createElement('div'); wrap.className='message assistant-message'; wrap.innerHTML=`<div class="avatar">✦</div><div><p>Here’s what I heard. Check it once, then I’ll create a mock complaint number.</p><div class="review-card">${summary}<div class="review-route">↗ ${escapeHtml(state.fields.route || 'National Consumer Helpline')}</div><button id="confirmButton" class="confirm-button">Looks right · continue</button></div><span class="message-time">just now</span></div>`; conversation.append(wrap); conversation.scrollTop=conversation.scrollHeight; suggestions.innerHTML=''; $('confirmButton').onclick=openVerification;
}
function openVerification() {
  if (state.submitted) return;
  $('verificationBackdrop').hidden=false;
  $('demoMobile').focus();
}
function submit() {
  if (state.submitted) return;
  state.submitted=true; state.docket=`NCH-DEMO-26-${Math.floor(1000 + Math.random() * 9000)}`; persist();
  addMessage('Done. Your mock complaint is logged. Keep this number if you want to follow up in this demo.'); speak('Done. Your mock complaint is logged.');
  addMessage(`Mock docket: ${state.docket}. Likely route: ${state.fields.route || 'National Consumer Helpline'}`);
  suggestions.innerHTML=''; const restart=document.createElement('button'); restart.className='suggestion'; restart.textContent='Start another complaint'; restart.onclick=resetDemo; suggestions.append(restart); renderState();
}
function resetDemo() { startNewChat(); }

const WELCOME_HTML = `<div class="date-stamp">TODAY · STARTING FRESH</div><div class="message assistant-message"><div class="avatar">✦</div><div><p>Hi. I’m here to help you get this off your chest — and into the right hands.</p><p>What happened? Say it in your own words. <strong>Don’t worry about categories or formal language.</strong></p><span class="message-time">just now</span></div></div>`;
const FIELD_DEFAULTS = {what:'Waiting for your story', who:'Seller or service provider', when:'Date and location', relief:'Refund, replacement or other relief'};

function startNewChat() {
  if (state.voicePhase === 'LISTENING') stopVoiceTurn();
  window.speechSynthesis?.cancel();
  state.audio?.pause();
  finishListening();
  $('verificationBackdrop').hidden = true;
  Object.assign(state, {fields:{}, messages:0, submitted:false, docket:'', location:null, outOfScope:undefined, aiMode:undefined});
  conversation.innerHTML = WELCOME_HTML;
  suggestions.innerHTML = '';
  input.value = '';
  $('keyboardComposer').hidden = false;
  $('trackingCard').hidden = true;
  $('locationBadge').hidden = true;
  $('routeText').textContent = 'We’ll suggest the right place to raise this';
  Object.entries(FIELD_DEFAULTS).forEach(([key, label]) => {
    const el = document.querySelector(`[data-field="${key}"]`);
    if (!el) return;
    el.classList.add('empty'); el.classList.remove('filled');
    el.querySelector('.field-icon').textContent = '◌';
    el.querySelector('p').textContent = label;
  });
  localStorage.removeItem('consumer-copilot-demo');
  renderState();
  showSuggestions();
  conversation.scrollTop = 0;
  window.scrollTo({top: document.querySelector('.workspace')?.offsetTop || 0, behavior:'smooth'});
}

$('sendButton').onclick=send; input.addEventListener('keydown',e=>{if(e.key==='Enter')send()}); $('photoButton').onclick=()=>$('photoInput').click();
$('photoInput').onchange=(e)=>{if(e.target.files[0]){state.fields.photo=e.target.files[0].name; persist(); addMessage(`I’ve attached ${e.target.files[0].name}.`, 'user'); addMessage('Photo saved for review. In this demo, image understanding is mocked; I’ll still ask for anything it cannot confirm.'); showSuggestions();}};
const voiceSession = { stream:null, recorder:null, chunks:[], maxTimer:null, startedAt:0 };

function pickAudioMimeType() {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const candidates = ios
    ? ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm']
    : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

function setListeningUi(active) {
  $('voiceStage')?.classList.toggle('is-listening', active);
  if (active) {
    $('voicePrompt').textContent='Listening…';
    $('voiceSubcopy').textContent='Tap the orb again when you’re done';
    $('voiceHint').textContent='Speak naturally — one turn at a time';
  } else {
    $('voicePrompt').textContent='Tap and speak';
    $('voiceSubcopy').textContent='I’ll listen until you tap again';
    $('voiceHint').textContent = location.protocol === 'https:' || location.hostname === 'localhost'
      ? 'Voice + text · mock government handoff'
      : 'Use HTTPS for microphone on mobile';
  }
}

function cleanupVoiceSession() {
  clearTimeout(voiceSession.maxTimer);
  voiceSession.maxTimer = null;
  voiceSession.recorder = null;
  voiceSession.chunks = [];
  if (voiceSession.stream) {
    voiceSession.stream.getTracks().forEach((track) => track.stop());
    voiceSession.stream = null;
  }
}

function finishListening() {
  cleanupVoiceSession();
  setVoicePhase('IDLE');
  setListeningUi(false);
}

async function blobToBase64(blob) {
  const buffer = await blob.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary);
}

async function transcribeBlob(blob) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch('/api/transcribe', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ audio: await blobToBase64(blob), mimeType: blob.type || 'audio/webm', language:'en' }),
      signal: controller.signal
    });
    if (response.status === 204) return '';
    if (!response.ok) return '';
    try { return (await response.json()).text?.trim() || ''; } catch { return ''; }
  } catch { return ''; } finally { clearTimeout(timeout); }
}

async function processVoiceTurn(blob, mimeType) {
  setVoicePhase('TRANSCRIBING');
  $('voicePrompt').textContent='Transcribing…';
  $('voiceSubcopy').textContent='Turning your words into text';
  $('voiceHint').textContent='One moment — first turn may take a few seconds';
  if (!blob || blob.size < 800) {
    finishListening();
    $('voiceHint').textContent='Speak a little longer, then tap the orb again';
    input.focus();
    return;
  }
  try {
    const text = await transcribeBlob(new Blob([blob], {type: mimeType || blob.type}));
    if (text) { input.value = text; send(); return; }
    finishListening();
    $('voiceHint').textContent='I couldn’t catch that — type your complaint below';
    input.focus();
  } catch {
    finishListening();
    $('voiceHint').textContent='Voice transcription is unavailable — type below';
    input.focus();
  }
}

async function startVoiceTurn() {
  if (state.voicePhase !== 'IDLE' || state.submitted) return;
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    $('voiceHint').textContent='Voice isn’t available here — type instead';
    input.focus();
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio:{ echoCancellation:true, noiseSuppression:true } });
    const mimeType = pickAudioMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? {mimeType} : undefined);
    voiceSession.stream = stream;
    voiceSession.recorder = recorder;
    voiceSession.chunks = [];
    voiceSession.startedAt = Date.now();
    recorder.ondataavailable = (event) => { if (event.data.size) voiceSession.chunks.push(event.data); };
    recorder.onstop = () => {
      const elapsed = Date.now() - voiceSession.startedAt;
      const blob = new Blob(voiceSession.chunks, {type: recorder.mimeType || mimeType || 'audio/webm'});
      const type = recorder.mimeType || mimeType;
      cleanupVoiceSession();
      if (elapsed < 700) {
        finishListening();
        $('voiceHint').textContent='Speak a little longer, then tap the orb again';
        return;
      }
      processVoiceTurn(blob, type);
    };
    setVoicePhase('LISTENING');
    setListeningUi(true);
    recorder.start(250);
    voiceSession.maxTimer = setTimeout(() => {
      if (voiceSession.recorder?.state === 'recording') stopVoiceTurn();
    }, 30000);
  } catch {
    finishListening();
    $('voiceHint').textContent='Microphone permission was declined — type below';
    input.focus();
  }
}

function stopVoiceTurn() {
  if (voiceSession.recorder?.state !== 'recording') return;
  try { voiceSession.recorder.requestData(); } catch {}
  voiceSession.recorder.stop();
}

$('micButton').onclick = () => {
  if (state.voicePhase === 'LISTENING') stopVoiceTurn();
  else startVoiceTurn();
};
$('helpButton').onclick=()=>{$('modalBackdrop').hidden=false}; $('modalClose').onclick=()=>{$('modalBackdrop').hidden=true}; $('modalBackdrop').onclick=e=>{if(e.target===$('modalBackdrop'))$('modalBackdrop').hidden=true};
$('newChatButton').onclick=startNewChat;
$('trackAction').onclick=()=>{ $('trackingStatus').textContent='Checked just now · mock status unchanged'; };
state.speaking = saved?.speaking ?? true;
$('voiceToggle').textContent = state.speaking ? 'Voice replies on' : 'Voice replies off';
$('voiceToggle').setAttribute('aria-pressed', String(state.speaking));
setVoicePhase(state.voicePhase || 'IDLE');
setListeningUi(false);
$('voiceToggle').onclick=()=>{state.speaking=!state.speaking; $('voiceToggle').textContent=state.speaking?'Voice replies on':'Voice replies off'; $('voiceToggle').setAttribute('aria-pressed', String(state.speaking)); if(!state.speaking){window.speechSynthesis?.cancel(); state.audio?.pause();} persist();};
$('verificationClose').onclick=()=>{$('verificationBackdrop').hidden=true};
$('verificationBackdrop').onclick=(event)=>{if(event.target===$('verificationBackdrop'))$('verificationBackdrop').hidden=true};
$('skipVerification').onclick=()=>{$('verificationBackdrop').hidden=true; submit();};
$('verifyButton').onclick=()=>{
  const mobile=$('demoMobile').value.replace(/\D/g,'');
  if(mobile.length!==10 || $('demoOtp').value.length!==6 || $('demoCaptcha').value.trim().toUpperCase()!=='7K4M'){
    $('verificationTitle').textContent='One small detail to check'; return;
  }
  $('verificationBackdrop').hidden=true; submit();
};
renderState();
showSuggestions();
if ('speechSynthesis' in window) window.speechSynthesis.getVoices();
fetch('/api/health').catch(() => {});
if (state.submitted) addMessage(`This demo has a saved mock docket: ${state.docket}. Start another complaint below when ready.`);
