export {};

declare global {
  interface Window {
    villani: {
      getSetupStatus: () => Promise<any>;
      startSetup: () => Promise<any>;
      startTask: (input: unknown) => Promise<any>;
      approveAction: (actionId: string) => Promise<boolean>;
      rejectAction: (actionId: string) => Promise<boolean>;
      stopTask: () => Promise<boolean>;
      getCurrentTask: () => Promise<any>;
      onSetupUpdated: (cb: (x: any) => void) => void;
      onTaskUpdated: (cb: (x: any) => void) => void;
    };
  }
}
