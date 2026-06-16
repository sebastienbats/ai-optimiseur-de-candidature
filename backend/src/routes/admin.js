import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { isAdmin } from '../middleware/admin.js';
import usersRouter from './admin/users.js';
import databaseRouter from './admin/database.js';
import emailRouter from './admin/email.js';

const router = express.Router();

// Appliquer les middlewares d'authentification et admin à toutes les routes
router.use(authenticate);
router.use(isAdmin);

// Sous-routes
router.use(usersRouter);
router.use('/database', databaseRouter);
router.use('/email', emailRouter);

export default router;
