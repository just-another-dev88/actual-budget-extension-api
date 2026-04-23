import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const configSchema = z.object({
  ACTUAL_SERVER_URL: z.string().url(),
  ACTUAL_PASSWORD: z.string().min(1),
  ACTUAL_BUDGET_ID: z.string().min(1),
  ACTUAL_DATA_DIR: z.string().default('./data'),
  ACTUAL_E2E_PASSWORD: z.string().optional(),
  API_KEY: z.string().min(18, 'API_KEY must be at least 18 characters long'),
  PORT: z.coerce.number().default(3000),
});

export const config = configSchema.parse(process.env);
