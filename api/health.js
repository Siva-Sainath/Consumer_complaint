export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).json({ error: 'Method not allowed' });
  return res.status(200).json({ ok: true, groq: Boolean(process.env.GROQ_API_KEY) });
}
