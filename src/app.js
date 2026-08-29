// A refresh intentionally starts a fresh demo session. Location search results
// may be cached separately, but complaint content is never restored.
const state = { fields:{}, messages:0, voicePhase:'IDLE', submitted:false, docket:'', location:null, speaking:true };
const DEVICE_KEY = 'consumer-copilot-demo-device';
const ISSUE_KEY = 'consumer-copilot-demo-issues';
const deviceId = localStorage.getItem(DEVICE_KEY) || (() => {
  const id = `device-${crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`}`;
  localStorage.setItem(DEVICE_KEY, id);
  return id;
})();
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
  // Keep the live complaint in memory only so a hard refresh clears the chat.
}
function localIssues() {
  try { return JSON.parse(localStorage.getItem(ISSUE_KEY) || '[]'); } catch { return []; }
}
function saveLocalIssue(issue) {
  const issues = [issue, ...localIssues().filter((item) => item.id !== issue.id)].slice(0, 20);
  localStorage.setItem(ISSUE_KEY, JSON.stringify(issues));
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
  const wrap = document.createElement('div');
  wrap.className = `message ${who}-message`;
  if (who === 'assistant') {
    const avatar = document.createElement('div');
    avatar.className = 'avatar assistant-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8L12 3z" fill="currentColor"/></svg>';
    const body = document.createElement('div');
    body.className = 'bubble';
    body.innerHTML = `<p>${escapeHtml(text)}</p>`;
    wrap.append(avatar, body);
  } else {
    const body = document.createElement('div');
    body.className = 'bubble';
    body.innerHTML = `<p>${escapeHtml(text)}</p>`;
    wrap.append(body);
  }
  conversation.append(wrap);
  conversation.scrollTop = conversation.scrollHeight;
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
  if (!text) return;
  if (!state.speaking) {
    setVoicePhase('IDLE');
    return;
  }
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
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch('/api/complaint-turn', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ text, current_fields: state.fields }), signal: controller.signal
    });
    if (!response.ok) return null;
    return await response.json();
  } catch { return null; } finally { clearTimeout(timeout); }
}

function mergeFields(partial) {
  for (const [key, value] of Object.entries(partial || {})) {
    const next = typeof value === 'string' ? value.trim() : value;
    if (next) state.fields[key] = next;
  }
}
function missingField() {
  if (!state.fields.what) return 'what';
  if (!state.fields.who) return 'who';
  if (!state.fields.when) return 'when';
  if (!state.fields.relief) return 'relief';
  return null;
}
function inferComplaint(text) {
  const t = text.toLowerCase();
  const next = {};
  if (/amazon|flipkart|myntra|swiggy|zomato|blinkit|seller|shop|store|company|bank|jio|airtel|service provider|restaurant|biryani|cafe|hotel|khrithunga|paradise/.test(t)) {
    const named = text.match(/\b(?:provider|seller|restaurant|shop|store|company|from|at)\s+(?:was\s+)?([^,.!?]+)/i);
    next.who = named?.[1]?.trim() || text.match(/amazon|flipkart|myntra|swiggy|zomato|blinkit|jio|airtel|bank|paradise|khrithunga[^,.!?]*/i)?.[0] || '';
  }
  if (/apolog|sorry|corrective|food safety|fssai|authority action/.test(t)) next.relief = /food safety|fssai|authority/.test(t) ? 'Food safety authority action' : 'Apology and corrective action';
  else if (/refund|money back|paise|₹|rs\.?\s?\d|rupees|charged|price|mrp|payment|amount/.test(t)) next.relief = 'Refund / money back';
  else if (/replacement|replace/.test(t)) next.relief = 'Replacement';
  if (/food|restaurant|expired|rotten|stale|packaged|fssai|biryani/.test(t)) next.route = 'FSSAI · food safety complaint';
  else if (/mrp|overcharg|price tag|weigh|weight|meter/.test(t)) next.route = 'Legal Metrology · overcharging / MRP';
  else if (/scam|fraud|upi|cyber|otp|online/.test(t)) next.route = 'Cyber Crime · online fraud';
  else if (next.who || state.fields.who) next.route = 'National Consumer Helpline · consumer grievance';
  if (text.length > 18) next.what = text.slice(0, 110) + (text.length > 110 ? '…' : '');
  const hasWhen = /yesterday|today|last week|\d+\s*days?\s*ago|two days|ago|january|february|march|april|may|june|july|august|september|october|november|december|\d{1,2}(?:st|nd|rd|th)?\s+\w+/i.test(t);
  const hasWhere = /\b(hyderabad|mumbai|delhi|bangalore|chennai|kolkata|pune|ahmedabad|kphb|colony|near|got it in|in [A-Z])/i.test(text);
  if (hasWhen || hasWhere) {
    const date = text.match(/(?:\d{1,2}(?:st|nd|rd|th)?\s+\w+|\d+\s*days?\s*ago|two days ago|yesterday|today)/i)?.[0];
    const place = text.match(/(?:in|at|near)\s+([^,.!?]{3,80})/i)?.[1]?.trim();
    const parts = [date, place].filter(Boolean);
    next.when = parts.length ? parts.join(' · ') : 'Date and place mentioned';
  }
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
  const missing = missingField();
  if (missing === 'relief') addSuggestion('', ['Refund','Replacement','Apology']);
  if (!state.submitted && !missing) addSuggestion('Review your complaint', [], false, true);
  else if (!state.submitted && missing === 'when') addSuggestion('', ['Yesterday','Last week']);
}
function addSuggestion(label, options=[], photo=false, review=false) {
  if (options.length) options.forEach(option => { const b=document.createElement('button'); b.className='suggestion'; b.textContent=option; b.onclick=()=>{ input.value=option; send(); }; suggestions.append(b); });
  else if (review) { const b=document.createElement('button'); b.className='suggestion review-chip'; b.textContent=label; b.onclick=openReview; suggestions.append(b); }
}

function respond(text, modelResult = null) {
  let reply;
  const missing = missingField();
  if (modelResult?.spoken_response) reply = String(modelResult.spoken_response).trim();
  else if (state.outOfScope) reply=`I understand. This is ${state.outOfScope}, so the consumer grievance route isn’t the right avenue. ${scopeGuidance[state.outOfScope]} I can still help with a product or service issue.`;
  else if (!missing) {
    const route = state.fields.route || 'the right channel';
    reply=`Thank you — I’ve captured what matters. This looks like a ${route} matter. When you’re ready, tap Review your complaint to check everything before we create a mock docket.`;
  } else if (missing === 'who') reply='That sounds really frustrating. Who was the seller or service provider? Even an approximate name is fine.';
  else if (missing === 'when') reply='Got it. When and where did this happen? A rough date and city or area is enough.';
  else if (missing === 'relief') reply='Understood. What would feel fair — a refund, replacement, apology, or something else?';
  else reply='I’m keeping track of the details. Tell me a bit more in your own words.';
  addMessage(reply);
  speak(reply);
}
async function send() {
  const text=input.value.trim();
  if(!text || state.submitted || voiceBusy()) return;
  addMessage(text,'user'); input.value=''; state.messages++;
  const scope = detectOutOfScope(text);
  if (scope) { state.outOfScope=scope; state.fields.route='Outside consumer grievance scope'; }
  else if (!state.outOfScope) mergeFields(inferComplaint(text));
  persist(); renderState(); setVoicePhase('THINKING'); showSuggestions();
  const place = locationPhrase(text);
  if (place && !state.location?.approved) { state.location={query:place, loading:false, result:null, approved:false}; persist(); showSuggestions(); }
  const result = await callGroq(text);
  if (result?.extracted_fields) {
    mergeFields(result.extracted_fields);
    if (result.routing && !state.outOfScope) state.fields.route = result.routing;
    state.aiMode = 'Groq enhanced';
  } else {
    state.aiMode = 'Local fallback';
  }
  persist(); renderState(); showSuggestions();
  respond(text, result);
}
function openReview() {
  if(state.submitted) return;
  const summary = Object.entries({Issue:state.fields.what, Seller:state.fields.who, 'When & where':state.fields.when, 'You want':state.fields.relief}).filter(([,v])=>v).map(([k,v])=>`<div><small>${k.toUpperCase()}</small><p>${escapeHtml(v)}</p></div>`).join('');
  const wrap=document.createElement('div'); wrap.className='message assistant-message'; wrap.innerHTML=`<div class="avatar assistant-avatar" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8L12 3z" fill="currentColor"/></svg></div><div class="bubble"><p>Here’s what I heard. Check it once, then I’ll create a mock complaint number.</p><div class="review-card">${summary}<div class="review-route">↗ ${escapeHtml(state.fields.route || 'National Consumer Helpline')}</div><button id="confirmButton" class="confirm-button">Looks right · continue</button></div></div>`; conversation.append(wrap); conversation.scrollTop=conversation.scrollHeight; suggestions.innerHTML=''; $('confirmButton').onclick=openVerification;
}
function openVerification() {
  if (state.submitted) return;
  renderContactFields();
  $('verificationBackdrop').hidden=false;
  $('demoMobile').focus();
}
function renderContactFields() {
  const selected = [...document.querySelectorAll('input[name="contactChannel"]:checked')].map((input) => input.value);
  $('contactFields').innerHTML = selected.map((channel) => {
    const labels = {whatsapp:'WhatsApp number', email:'Email address', sms:'Phone number'};
    const types = {whatsapp:'tel', email:'email', sms:'tel'};
    const values = {whatsapp:'9999900000', email:'demo@example.com', sms:'9999900000'};
    return `<label for="contact-${channel}">${labels[channel]}</label><input id="contact-${channel}" class="verification-input contact-input" data-channel="${channel}" type="${types[channel]}" value="${values[channel]}" autocomplete="off" />`;
  }).join('');
}
function selectedContacts() {
  return [...document.querySelectorAll('.contact-input')].map((input) => ({
    channel: input.dataset.channel, detail: input.value.trim()
  })).filter((item) => item.detail);
}
function validContacts(contacts) {
  return contacts.every(({channel, detail}) => channel === 'email'
    ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(detail)
    : detail.replace(/\D/g, '').length >= 10);
}
async function createIssue(contacts = []) {
  const response = await fetch('/api/issues', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({device_id:deviceId, fields:state.fields, contact_preferences:contacts})
  });
  if (!response.ok) throw new Error('Issue could not be created');
  return response.json();
}
async function submit() {
  if (state.submitted) return;
  const contacts = selectedContacts();
  if (contacts.length && !validContacts(contacts)) {
    $('verificationTitle').textContent='Please check the contact details';
    return;
  }
  const submitButton = $('verifyButton');
  submitButton.disabled = true;
  submitButton.textContent = 'Creating your issue…';
  let result;
  try { result = await createIssue(contacts); } catch { result = {issue: createLocalIssue(contacts), source:'local-fallback'}; }
  const issue = result.issue;
  saveLocalIssue(issue);
  state.submitted=true; state.docket=issue.reference_id; persist();
  $('verificationBackdrop').hidden=true;
  addMessage('Done. Your mock complaint is logged. Keep this number if you want to follow up in this demo.'); speak('Done. Your mock complaint is logged.');
  addMessage(`Mock docket: ${state.docket}. Likely route: ${state.fields.route || 'National Consumer Helpline'}`);
  suggestions.innerHTML=''; const restart=document.createElement('button'); restart.className='suggestion'; restart.textContent='Start another complaint'; restart.onclick=resetDemo; suggestions.append(restart); renderState();
  submitButton.disabled = false;
  submitButton.textContent = 'Create mock issue';
}
function createLocalIssue(contacts) {
  const now = new Date().toISOString();
  return {id:`local-${Date.now()}`, reference_id:`NCH-DEMO-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`, title:state.fields.what || 'Consumer complaint', category:state.fields.route || 'National Consumer Helpline', status:'submitted', details:{...state.fields}, contact_preferences:contacts, submitted_at:now, updated_at:now, recent_update:'Complaint submitted for review.', updates:[{status:'submitted', message:'Complaint submitted for review.', created_at:now}]};
}
function resetDemo() { startNewChat(); }
const statusLabels = {
  submitted:'Submitted', under_review:'Under review', awaiting_user_response:'Awaiting your response',
  escalated:'Escalated', resolved:'Resolved', closed:'Closed'
};
function formatDate(value) {
  return value ? new Intl.DateTimeFormat('en-IN', {day:'2-digit', month:'short', year:'numeric'}).format(new Date(value)) : '—';
}
function renderIssues(issues, source = 'local') {
  const list = $('issuesList');
  if (!issues.length) {
    list.innerHTML = '<div class="empty-issues"><strong>No issues yet</strong><span>Submit a complaint and its reference will appear here.</span></div>';
    return;
  }
  list.innerHTML = issues.map((issue) => {
    const updates = issue.updates || issue.issue_updates || [];
    const timeline = updates.map((item) => `<li><span></span><div><strong>${escapeHtml(statusLabels[item.status] || item.status || 'Update')}</strong><small>${escapeHtml(item.message || '')} · ${formatDate(item.created_at)}</small></div></li>`).join('');
    return `<article class="issue-card"><div class="issue-card-top"><span class="issue-ref">${escapeHtml(issue.reference_id || issue.id)}</span><span class="status-pill status-${escapeHtml(issue.status || 'submitted')}">${escapeHtml(statusLabels[issue.status] || 'Submitted')}</span></div><h3>${escapeHtml(issue.title)}</h3><p class="issue-meta">${escapeHtml(issue.category)} · Submitted ${formatDate(issue.submitted_at)} · Updated ${formatDate(issue.updated_at)}</p><ol class="issue-timeline">${timeline || '<li><span></span><div><strong>Submitted</strong><small>Complaint submitted for review.</small></div></li>'}</ol></article>`;
  }).join('');
  list.dataset.source = source;
}
async function openTracking() {
  $('trackingBackdrop').hidden = false;
  $('issuesList').innerHTML = '<div class="empty-issues">Loading your issues…</div>';
  let issues = localIssues();
  try {
    const response = await fetch(`/api/issues?device_id=${encodeURIComponent(deviceId)}`);
    if (response.ok) {
      const result = await response.json();
      if (Array.isArray(result.issues) && result.issues.length) issues = result.issues;
    }
  } catch {}
  renderIssues(issues);
}

const WELCOME_HTML = `<div class="date-stamp">Today</div><div class="message assistant-message"><div class="avatar assistant-avatar" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8L12 3z" fill="currentColor"/></svg></div><div class="bubble"><p>Hi. Tell me what happened in your own words — no formal language needed.</p><p><strong>I’ll only ask about what’s still missing.</strong></p></div></div>`;
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

$('sendButton').onclick=send; input.addEventListener('keydown',e=>{if(e.key==='Enter')send()});
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
    if (text) {
      finishListening();
      input.value = text;
      send();
      return;
    }
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
state.speaking = true;
function updateVoiceToggle() {
  const icon = state.speaking
    ? '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 10v4h4l5 4V6l-5 4H4Z" fill="currentColor"/><path d="M17 9.5a4 4 0 0 1 0 5M19.5 7a7.5 7.5 0 0 1 0 10" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>'
    : '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 10v4h4l5 4V6l-5 4H4Z" fill="currentColor"/><path d="m17 9 4 6m0-6-4 6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
  $('voiceToggle').innerHTML = icon;
  $('voiceToggle').setAttribute('aria-label', state.speaking ? 'Turn voice replies off' : 'Turn voice replies on');
  $('voiceToggle').title = state.speaking ? 'Turn voice replies off' : 'Turn voice replies on';
}
updateVoiceToggle();
$('voiceToggle').setAttribute('aria-pressed', String(state.speaking));
setVoicePhase(state.voicePhase || 'IDLE');
setListeningUi(false);
$('voiceToggle').onclick=()=>{state.speaking=!state.speaking; updateVoiceToggle(); $('voiceToggle').setAttribute('aria-pressed', String(state.speaking)); if(!state.speaking){window.speechSynthesis?.cancel(); state.audio?.pause();} persist();};
$('verificationClose').onclick=()=>{$('verificationBackdrop').hidden=true};
$('verificationBackdrop').onclick=(event)=>{if(event.target===$('verificationBackdrop'))$('verificationBackdrop').hidden=true};
$('trackIssuesButton').onclick=openTracking;
$('trackingClose').onclick=()=>{$('trackingBackdrop').hidden=true};
$('trackingBackdrop').onclick=(event)=>{if(event.target===$('trackingBackdrop'))$('trackingBackdrop').hidden=true};
document.querySelectorAll('input[name="contactChannel"]').forEach((input) => input.addEventListener('change', renderContactFields));
$('skipVerification').onclick=()=>{$('verificationBackdrop').hidden=true; submit();};
$('verifyButton').onclick=()=>submit();
renderState();
showSuggestions();
if ('speechSynthesis' in window) window.speechSynthesis.getVoices();
fetch('/api/health').catch(() => {});
