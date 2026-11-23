import 'dotenv/config';
import mongoose from 'mongoose';
import { createApp } from './app.js';
import { initIndexes } from './models.js';
if (!process.env.MONGODB_URI)
  throw new Error('MONGODB_URI is required. Copy .env.example to .env.');
await mongoose.connect(process.env.MONGODB_URI);
await initIndexes();
const app = createApp({
  mongoUrl: process.env.MONGODB_URI,
  secret: process.env.SESSION_SECRET,
  production: process.env.NODE_ENV === 'production',
  uploadDir: process.env.UPLOAD_DIR,
  trustProxy: process.env.TRUST_PROXY === '1',
});
const server = app.listen(Number(process.env.PORT || 3000), '0.0.0.0', () =>
  console.log('Campus Connect listening on port ' + (process.env.PORT || 3000)),
);
async function shutdown() {
  server.close(async () => {
    await mongoose.disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
