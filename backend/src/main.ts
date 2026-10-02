/** Production entry point (used by Render and `npm start`). */
import { config } from './config';
import { connect } from './db';
import { createApp } from './server';

await connect();
createApp().listen(config.port, '0.0.0.0', () => console.log(`API listening on :${config.port}`));
