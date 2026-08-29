const statuses = new Set(['submitted', 'under_review', 'awaiting_user_response', 'escalated', 'resolved', 'closed']);

function supabaseConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function headers() {
  return {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation'
  };
}

function cleanIssue(input = {}) {
  const fields = input.fields || {};
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
      who: String(fields.who || '').slice(0, 180),
      when: String(fields.when || '').slice(0, 180),
      relief: String(fields.relief || '').slice(0, 180)
    }
  };
}

function mockIssue(input) {
  const issue = cleanIssue(input);
  const now = new Date().toISOString();
  return {
    id: `demo-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`,
    reference_id: `NCH-DEMO-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`,
    ...issue,
    submitted_at: now,
    updated_at: now,
    recent_update: 'Complaint submitted for review.',
    updates: [{ status: 'submitted', message: 'Complaint submitted for review.', created_at: now }]
  };
}

async function supabaseRequest(path, options = {}) {
  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {...headers(), ...(options.headers || {})}
  });
  if (!response.ok) throw new Error(`Supabase request failed: ${response.status}`);
  return response.status === 204 ? null : response.json();
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({error: 'Method not allowed'});
  const deviceId = String(req.method === 'GET' ? req.query?.device_id : req.body?.device_id || '').slice(0, 80);
  if (!deviceId) return res.status(400).json({error: 'A demo device ID is required'});

  try {
    if (req.method === 'GET') {
      if (!supabaseConfigured()) return res.status(200).json({issues: [], source: 'local'});
      const issues = await supabaseRequest(`issues?device_id=eq.${encodeURIComponent(deviceId)}&select=*,issue_updates(*)&order=updated_at.desc`);
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
    return res.status(200).json({issue: mockIssue(req.body), source: 'local'});
  } catch {
    return res.status(200).json({issue: req.method === 'POST' ? mockIssue(req.body) : undefined, issues: req.method === 'GET' ? [] : undefined, source: 'local-fallback'});
  }
}
