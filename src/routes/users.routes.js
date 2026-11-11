import { Router } from 'express';
import { validate } from '#middleware/validate.middleware.js';
import { authenticate } from '#middleware/auth.middleware.js';
import { updateUserSchema } from '#validations/users.validations.js';
import {
  fetchAllUsers,
  fetchUserById,
  updateUserById,
  deleteUserById,
} from '#controllers/users.controller.js';

const router = Router();

// All user routes require a valid token.
router.use(authenticate);

router.get('/', fetchAllUsers);
router.get('/:id', fetchUserById);
router.put('/:id', validate(updateUserSchema), updateUserById);
router.delete('/:id', deleteUserById);

export default router;
