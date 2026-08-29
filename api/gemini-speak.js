function pcmToWav(base64, sampleRate = 24000, channels = 1, bitsPerSample = 16) {
  const pcm = Buffer.from(base64, 'base64');
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * channels * bitsPerSample / 8;
  const blockAlign = channels * bitsPerSample / 8;
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});
  if (!process.env.GEMINI_API_KEY) return res.status(503).json({error:'Gemini speech is not configured'});
  const {text} = req.body || {};
  if (!text || /[\u0900-\u097F]/.test(text)) return res.status(400).json({error:'English text is required'});
  if (text.length > 200) return res.status(413).json({error:'Speech text is too long'});

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 16000);
  try {
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-tts-preview:generateContent',
      {
        method:'POST',
        headers:{'Content-Type':'application/json', 'x-goog-api-key':process.env.GEMINI_API_KEY},
        body:JSON.stringify({
          contents:[{parts:[{text:`Speak naturally, warmly, and clearly: ${text}`}]}],
          generationConfig:{
            responseModalities:['AUDIO'],
            speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:'Kore'}}}
          }
        }),
        signal:controller.signal
      }
    );
    if (!response.ok) return res.status(502).json({error:'Gemini speech is unavailable'});
    const payload = await response.json();
    const audio = payload.candidates?.[0]?.content?.parts?.find((part) => part.inlineData)?.inlineData;
    if (!audio?.data) return res.status(502).json({error:'Gemini returned no audio'});
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(pcmToWav(audio.data));
  } catch {
    return res.status(502).json({error:'Gemini speech could not be generated'});
  } finally {
    clearTimeout(timeout);
  }
}
