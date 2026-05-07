import { taskStore } from './taskStore';
import { DEFAULT_LOCAL_MODEL_BACKEND_CONFIG, type LocalModelBackendConfig } from '../model/LlamaServerManager';

const key = 'modelBackendConfig';

export const modelBackendStore = {
  getConfig(): LocalModelBackendConfig {
    const raw = taskStore.getSetupState()?.[key] ?? {};
    return { ...DEFAULT_LOCAL_MODEL_BACKEND_CONFIG, ...raw };
  },
  saveConfig(config: LocalModelBackendConfig){
    const setup = taskStore.getSetupState();
    taskStore.saveSetupState({ ...setup, [key]: config });
  }
};
