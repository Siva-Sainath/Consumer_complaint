import {defineConfig, loadEnv} from 'vite';
import complaintTurn from './api/complaint-turn.js';
import transcribe from './api/transcribe.js';
import speak from './api/speak.js';
import health from './api/health.js';

function localResponse(res) {
  return {
    status(code){res.statusCode=code; return this;},
    setHeader(name,value){res.setHeader(name,value);},
    json(value){res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(value));},
    send(value){res.end(value);},
    end(){res.end();}
  };
}
async function parseBody(req) {
  if (req.method==='GET' || req.method==='HEAD') return {};
  let raw=''; for await (const chunk of req) raw+=chunk;
  try {return JSON.parse(raw || '{}');} catch {return {};}
}

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, process.cwd(), '');
  if (env.GROQ_API_KEY) process.env.GROQ_API_KEY = env.GROQ_API_KEY;

  return {
    plugins:[{
      name:'local-groq-api',
      configureServer(server){
        server.middlewares.use('/api', async (req,res,next)=>{
          const path=req.url?.split('?')[0];
          const handlers={'/complaint-turn':complaintTurn,'/transcribe':transcribe,'/speak':speak,'/health':health};
          if(!handlers[path]) return next();
          req.body=await parseBody(req);
          try {await handlers[path](req,localResponse(res));} catch {res.statusCode=204; res.end();}
        });
      }
    }]
  };
});
