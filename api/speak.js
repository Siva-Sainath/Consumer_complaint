export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});
  if (!process.env.GROQ_API_KEY) return res.status(503).json({error:'Speech service is not configured'});
  const { text } = req.body || {};
  if (!text || /[\u0900-\u097F]/.test(text)) return res.status(400).json({error:'English text is required'});
  if (text.length > 200) return res.status(413).json({error:'Speech text is too long'});
  try {
    let upstream;
    let errorDetail = '';
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      try {
        upstream = await fetch('https://api.groq.com/openai/v1/audio/speech', {
          method:'POST',
          headers:{Authorization:`Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type':'application/json'},
          body:JSON.stringify({
            model:'canopylabs/orpheus-v1-english',
            voice:'troy',
            input:`[warm][reassuring] ${text}`,
            response_format:'wav'
          }),
          signal: controller.signal
        });
        if (!upstream.ok) errorDetail = await upstream.text();
        if (upstream.ok) break;
      } finally {
        clearTimeout(timeout);
      }
    }
    if (!upstream?.ok) {
      console.error('Groq speech error', errorDetail);
      return res.status(502).json({error:'Speech service is unavailable', detail:errorDetail.slice(0, 300)});
    }
    const audio=Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type','audio/wav');
    res.setHeader('Cache-Control','no-store');
    return res.status(200).send(audio);
  } catch { return res.status(502).json({error:'Speech could not be generated'}); }
}
