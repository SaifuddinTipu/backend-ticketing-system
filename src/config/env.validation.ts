import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(8080),
  MONGO_URI: Joi.string().required(),
  REDIS_URL: Joi.string().required(),
  SEAT_HOLD_TTL_SECONDS: Joi.number().default(600),
});
