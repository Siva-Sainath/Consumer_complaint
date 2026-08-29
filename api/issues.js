function supabaseUrl() {
  return process.env.SUPABASE_URL || process.env.SUPABASE_PROJECT_URL;
}

function supabaseKeys() {
  return [...new Set([
    process.env.SUPABASE_PUBLISHABLE_KEY,
    process.env.SUPABASE_ANON_KEY,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.SUPABASE_KEY
  ].filter(Boolean))];
}

function supabaseConfigured() {
  return Boolean(supabaseUrl() && supabaseKeys().length);
}

function headers(key) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation'
  };
}

function cleanIssue(input = {}) {
  const fields = input.fields || {};
  const attachments = Array.isArray(input.attachments) ? input.attachments : [];
  const channels = Array.isArray(input.contact_preferences) ? input.contact_preferences : [];
  return {
    device_id: String(input.device_id || '').slice(0, 80),
    title: String(input.title || fields.what || 'Consumer complaint').slice(0, 180),
    category: String(input.category || fields.route || 'National Consumer Helpline').slice(0, 120),
    status: 'submitted',
    contact_preferences: channels.slice(0, 4).map((item) => ({
      channel: String(item.channel || '').slice(0, 30),
      detail: String(item.detail || '').slice(0, 160)
    })),
    details: {
      what: String(fields.what || '').slice(0, 500),
      category: String(fields.category || '').slice(0, 120),
      product_or_service: String(fields.product_or_service || '').slice(0, 180),
      who: String(fields.who || '').slice(0, 180),
      when: String(fields.when || '').slice(0, 180),
      location: String(fields.location || '').slice(0, 180),
      amount_paid: String(fields.amount_paid || '').slice(0, 80),
      order_reference: String(fields.order_reference || '').slice(0, 100),
      relief: String(fields.relief || '').slice(0, 180),
      evidence: String(fields.evidence || '').slice(0, 180),
      attachments: attachments.slice(0, 3).map((item) => ({
        name: String(item.name || '').slice(0, 120),
        type: String(item.type || '').slice(0, 80),
        size: Number.isFinite(item.size) ? Math.min(Math.max(0, item.size), 52428800) : 0
      }))
    }
  };
}

async function supabaseRequest(path, options = {}) {
  const keys = supabaseKeys();
  let lastStatus = 502;
  for (const key of keys) {
    const response = await fetch(`${supabaseUrl()}/rest/v1/${path}`, {
      ...options,
      headers: {...headers(key), ...(options.headers || {})}
    });
    if (response.ok) return response.status === 204 ? null : response.json();
    lastStatus = response.status;
  }
  throw new Error(`Supabase request failed: ${lastStatus}`);
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({error: 'Method not allowed'});
  const deviceId = String(req.method === 'GET' ? req.query?.device_id : req.body?.device_id || '').slice(0, 80);
  if (!deviceId) return res.status(400).json({error: 'A demo device ID is required'});
  if (!supabaseConfigured()) return res.status(503).json({error: 'Issue tracking is not configured'});

  try {
    if (req.method === 'GET') {
      const reference = String(req.query?.reference_id || '').slice(0, 120);
      const referenceFilter = reference ? `&reference_id=eq.${encodeURIComponent(reference)}` : '';
      const issues = await supabaseRequest(`issues?device_id=eq.${encodeURIComponent(deviceId)}${referenceFilter}&select=*,issue_updates(*)&order=updated_at.desc`);
      return res.status(200).json({issues, source: 'supabase'});
    }

    const issue = cleanIssue(req.body);
    if (!issue.details.what) return res.status(400).json({error: 'Complaint fields are required'});
    if (supabaseConfigured()) {
      const created = await supabaseRequest('issues', {method: 'POST', body: JSON.stringify(issue)});
      const saved = Array.isArray(created) ? created[0] : created;
      const now = new Date().toISOString();
      await supabaseRequest('issue_updates', {
        method: 'POST',
        body: JSON.stringify({issue_id: saved.id, status: 'submitted', message: 'Complaint submitted for review.', created_at: now})
      });
      return res.status(200).json({issue: {...saved, updates: [{status: 'submitted', message: 'Complaint submitted for review.', created_at: now}]}, source: 'supabase'});
    }
    return res.status(503).json({error: 'Issue tracking is not configured'});
  } catch {
    return res.status(502).json({error: 'Issue tracking is temporarily unavailable'});
  }
}
