import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      NODE_ENV: 'test',
      ACTUAL_SERVER_URL: 'http://localhost:5006',
      ACTUAL_PASSWORD: 'test_password',
      ACTUAL_BUDGET_ID: 'test-budget-id',
      ACTUAL_DATA_DIR: './data',
      API_KEY: 'test_api_key_1234567890',
      TELEGRAM_BOT_TOKEN: '123456:TEST_TOKEN',
      TELEGRAM_ALLOWED_USERS: '111,222',
      APP_TIMEZONE: 'Asia/Manila',
      APP_LOCALE: 'en-US',
      CURRENCY_CODE: 'USD',
    },
  },
});
