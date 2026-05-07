import { ModelSetupManager } from '../model/ModelSetupManager';

const manager = new ModelSetupManager();
export const setupStore = {
  state: { status: 'checking', progress: 0 },
  get() { return this.state; },
  async start(onUpdate?: (s: any) => void) {
    const out = await manager.ensureReady((status, progress) => {
      this.state = { status, progress };
      onUpdate?.(this.state);
    });
    this.state = { status: out.status, progress: 1 };
    onUpdate?.(this.state);
    return this.state;
  },
};
