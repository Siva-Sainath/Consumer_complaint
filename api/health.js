export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).json({ error: 'Method not allowed' });
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  let supabase = false;
  if (process.env.SUPABASE_URL && key) {
    try {
      const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/issues?select=id&limit=1`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` }
      });
      supabase = response.ok;
    } catch {}
  }
  return res.status(200).json({ ok: true, groq: Boolean(process.env.GROQ_API_KEY), supabase });
}
