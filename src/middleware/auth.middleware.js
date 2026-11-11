import logger from '#config/logger.js';
import { jwttoken } from '#utils/jwt.js';
import { cookies } from '#utils/cookies.js';

const extractToken = req => {
  const header = req.headers.authorization;

  if (header && header.startsWith('Bearer ')) {
    return header.slice(7).trim();
  }

  return cookies.get(req, 'token');
};

// Verifies the JWT from the `token` cookie or an `Authorization: Bearer` header
// and attaches the decoded payload to `req.user`.
export const authenticate = (req, res, next) => {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    req.user = jwttoken.verify(token);
    next();
  } catch (error) {
    logger.warn(`Token verification failed: ${error.message}`);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};
