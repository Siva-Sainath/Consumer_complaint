export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({error: 'Method not allowed'});
  const url = process.env.SUPABASE_URL || process.env.SUPABASE_PROJECT_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
  if (!url || !key) return res.status(503).json({error: 'Evidence storage is not configured'});
  return res.status(200).json({url, key});
}
