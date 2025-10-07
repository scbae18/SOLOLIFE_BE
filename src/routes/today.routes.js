import { Router } from 'express';
import { authRequired } from '../lib/authMiddleware.js';
import { getTodayRecommendation } from '../controllers/today.controller.js';

const router = Router();

router.get('/', authRequired, getTodayRecommendation);

export default router;