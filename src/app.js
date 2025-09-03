import express from 'express';
import morgan from 'morgan';
import cors from 'cors';
import { ApiError } from './lib/ApiError.js';
import { initSwagger } from './config/swagger.js';

import authRoutes from './routes/auth.routes.js';
import usersRoutes from './routes/users.routes.js';
import charactersRoutes from './routes/characters.routes.js';
import questsRoutes from './routes/quests.routes.js';
import locationsRoutes from './routes/locations.routes.js';
import journeysRoutes from './routes/journeys.routes.js';
import logbooksRoutes from './routes/logbooks.routes.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(morgan('dev'));

// routes
app.use('/auth', authRoutes);
app.use('/users', usersRoutes);
app.use('/characters', charactersRoutes);
app.use('/quests', questsRoutes);
app.use('/locations', locationsRoutes);
app.use('/journeys', journeysRoutes);
app.use('/logbooks', logbooksRoutes);

initSwagger(app);

// 404
app.use((req, res, next) => next(new ApiError(404, 'Not Found')));

// error handler
app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Server error', meta: err.meta || undefined });
});

export default app;
