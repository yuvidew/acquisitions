import { Router } from 'express';
import { signupSchema, signInSchema } from '#validations/auth.validations.js';
import { validate } from '#middleware/validate.middleware.js';
import { signup, signIn, signOut } from '#controllers/auth.controller.js';

const router = Router();

router.post('/sign-up', validate(signupSchema), signup);

router.post('/sign-in', validate(signInSchema), signIn);

router.post('/sign-out', signOut);

export default router;
