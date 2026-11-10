import logger from '#config/logger.js';

/**
 * Arcjet security middleware factory.
 *
 * @param {object} client - Arcjet client (e.g. generalAj, signupAj, signInAj)
 * @param {(req) => object} [getProps] - Optional fn returning extra request
 *   properties for rules (e.g. `{ email }` for validateEmail).
 */
export const security = (client, getProps) => async (req, res, next) => {
  try {
    const decision = await client.protect(req, getProps ? getProps(req) : {});

    if (decision.isDenied()) {
      const meta = {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
        method: req.method,
      };

      if (decision.reason.isBot()) {
        logger.warn('Bot request blocked', meta);
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Automated requests are not allowed',
        });
      }

      if (decision.reason.isShield()) {
        logger.warn('Shield blocked request', meta);
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Request blocked by security policy',
        });
      }

      if (decision.reason.isRateLimit()) {
        logger.warn('Rate limit exceeded', meta);
        return res.status(429).json({
          error: 'Too Many Requests',
          message: 'Too many requests, please slow down',
        });
      }

      if (decision.reason.isEmail()) {
        logger.warn('Email validation failed', meta);
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Invalid or disposable email address',
        });
      }

      logger.warn('Request denied by Arcjet', meta);
      return res.status(403).json({ error: 'Forbidden' });
    }

    next();
  } catch (e) {
    // Fail open: an Arcjet outage shouldn't take the API down.
    logger.error('Arcjet middleware error:', e);
    next();
  }
};
