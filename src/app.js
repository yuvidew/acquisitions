import logger from '#config/logger.js';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import authRoutes from '#routes/auth.routes.js';
import { security } from '#middleware/security.middleware.js';
import { generalAj } from '#config/arcjet.js';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(
  morgan('combined', {
    stream: { write: message => logger.info(message.trim()) },
  })
);

// Global Arcjet protection (shield, bot detection, general rate limit).
// Auth routes add stricter per-route limits on top of this.
app.use(security(generalAj));

app.get('/', (req, res) => {
  logger.info('Hello from Acquisitions');
  res.status(200).json({
    message: 'Hello from the server',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

app.get('/api', (req, res) => {
  res.status(200).json({
    message: 'Acquisitions API is running!',
  });
});

app.use('/api/auth', authRoutes);

export default app;
