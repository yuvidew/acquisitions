import { formatValidationError } from '#utils/format.js';

export const validate = schema => (req, res, next) => {
  const result = schema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).json({
      error: 'Validation failed',
      details: formatValidationError(result.error),
    });
  }

  req.body = result.data;
  next();
};
