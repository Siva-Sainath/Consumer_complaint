export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});
  if (!process.env.GROQ_API_KEY) return res.status(204).end();
  try {
    const { audio, mimeType = 'audio/webm', language } = req.body || {};
    if (!audio) return res.status(400).json({error:'Audio is required'});
    const bytes = Buffer.from(audio, 'base64');
    const form = new FormData();
    form.append('file', new Blob([bytes], {type:mimeType}), 'complaint.webm');
    form.append('model', 'whisper-large-v3-turbo');
    form.append('temperature', '0');
    if (language) form.append('language', language);
    const upstream = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method:'POST',
      headers:{Authorization:`Bearer ${process.env.GROQ_API_KEY}`},
      body:form
    });
    if (!upstream.ok) return res.status(204).end();
    const result = await upstream.json();
    return res.status(200).json({text: String(result.text || '')});
  } catch {
    return res.status(204).end();
  }
}
