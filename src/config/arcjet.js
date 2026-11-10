import 'dotenv/config';
import arcjet, {
  shield,
  detectBot,
  slidingWindow,
  validateEmail,
} from '@arcjet/node';

// Base client: rules applied to every protected route.
const aj = arcjet({
  key: process.env.ARCJET_KEY,
  rules: [
    // Shield protects against common attacks (SQLi, XSS, etc.)
    shield({ mode: 'LIVE' }),
    // Block automated clients, but allow search engines and link previews
    // Postman/curl are flagged as bots, so only enforce in production.
    detectBot({
      mode: process.env.NODE_ENV === 'production' ? 'LIVE' : 'DRY_RUN',
      allow: ['CATEGORY:SEARCH_ENGINE', 'CATEGORY:PREVIEW'],
    }),
  ],
});

// Route-specific clients derived with withRule() so they share the decision cache.
export const signupAj = aj
  .withRule(
    validateEmail({
      mode: 'LIVE',
      deny: ['DISPOSABLE', 'INVALID', 'NO_MX_RECORDS'],
    })
  )
  .withRule(slidingWindow({ mode: 'LIVE', interval: '10m', max: 5 }));

export const signInAj = aj.withRule(
  slidingWindow({ mode: 'LIVE', interval: '10m', max: 10 })
);

export const generalAj = aj.withRule(
  slidingWindow({ mode: 'LIVE', interval: '1m', max: 60 })
);

export default aj;
