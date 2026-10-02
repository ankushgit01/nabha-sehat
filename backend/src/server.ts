import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { config } from './config';
import { connect } from './db';
import { auth } from './routes/auth';
import { sync } from './routes/sync';
import { consultations, doctor } from './routes/consultations';
import { facilities, files, schemes } from './routes/misc';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigins.length ? config.corsOrigins : false }));
  app.use(express.json({ limit: '1mb' }));
  if (config.prod) app.use(pinoHttp({ redact: ['req.headers.authorization', 'req.body'] })); // never log health data

  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.use('/v1/auth', auth);
  app.use('/v1/sync', sync);
  app.use('/v1/consultations', consultations);
  app.use('/v1/doctor', doctor);
  app.use('/v1/schemes', schemes);
  app.use('/v1/facilities', facilities);
  app.use('/v1/files', files);

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  });
  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await connect();
  createApp().listen(config.port, () => console.log(`API on :${config.port}`));
}
