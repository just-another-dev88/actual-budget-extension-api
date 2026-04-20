import * as api from '@actual-app/api';
import { config } from '../config';

let _ready = false;

export async function initActual() {
  if (_ready) {
    await api.shutdown();
  }

  await api.init({
    dataDir: config.ACTUAL_DATA_DIR,
    serverURL: config.ACTUAL_SERVER_URL,
    password: config.ACTUAL_PASSWORD,
  });

  await api.downloadBudget(config.ACTUAL_BUDGET_ID, {
    password: config.ACTUAL_E2E_PASSWORD,
  });

  _ready = true;
}

export async function reloadActual() {
  _ready = false;
  await initActual();
}

export function getActualApi() {
  if (!_ready) throw new Error('Actual client not initialised');
  return api;
}

export async function shutdownActual() {
  if (_ready) {
    await api.shutdown();
    _ready = false;
  }
}
