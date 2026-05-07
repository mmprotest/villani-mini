import { ModelSetupManager } from '../model/ModelSetupManager';
import { taskStore } from './taskStore';

const manager = new ModelSetupManager();
export const setupStore = {
  state: taskStore.getSetupState(),
  get() { return this.state; },
  async start(onUpdate?: (s: any) => void) {
    const out = await manager.ensureReady((status, progress) => {
      this.state = { status, progress };
      taskStore.saveSetupState(this.state);
      onUpdate?.(this.state);
    });
    this.state = { status: out.status, progress: 1 };
    taskStore.saveSetupState(this.state);
    onUpdate?.(this.state);
    return this.state;
  },
};
