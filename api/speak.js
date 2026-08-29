export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});
  if (!process.env.GROQ_API_KEY) return res.status(204).end();
  const { text } = req.body || {};
  if (!text || /[\u0900-\u097F]/.test(text)) return res.status(204).end();
  try {
    let upstream;
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
            response_format:'wav',
            speed:0.98
          }),
          signal: controller.signal
        });
        if (upstream.ok) break;
      } finally {
        clearTimeout(timeout);
      }
    }
    if (!upstream.ok) return res.status(204).end();
    const audio=Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type','audio/wav');
    res.setHeader('Cache-Control','no-store');
    return res.status(200).send(audio);
  } catch { return res.status(204).end(); }
}
