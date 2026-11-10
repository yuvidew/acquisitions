import { Router } from 'express';
import { signupSchema, signInSchema } from '#validations/auth.validations.js';
import { validate } from '#middleware/validate.middleware.js';
import { security } from '#middleware/security.middleware.js';
import { signupAj, signInAj } from '#config/arcjet.js';
import { signup, signIn, signOut } from '#controllers/auth.controller.js';

const router = Router();

router.post(
  '/sign-up',
  validate(signupSchema),
  security(signupAj, req => ({ email: req.body.email })),
  signup
);

router.post('/sign-in', security(signInAj), validate(signInSchema), signIn);

router.post('/sign-out', signOut);

export default router;
