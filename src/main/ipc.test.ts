import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, any>(), send: vi.fn(), onEvent: vi.fn(), onUpdated: vi.fn(), rejectAction: vi.fn(), answerUserQuestion: vi.fn(), runTask: vi.fn(), appendTaskResult: vi.fn((s:any)=>s)
}));

vi.mock('electron', () => ({ ipcMain: { handle: (name: string, fn: any) => mocks.handlers.set(name, fn) }, clipboard:{writeText:vi.fn()}, shell:{openPath:vi.fn()} }));
vi.mock('../agent/AgentController', () => ({ agentController: { onEvent: mocks.onEvent, rejectAction: mocks.rejectAction, answerUserQuestion: mocks.answerUserQuestion, runTask: mocks.runTask, approveAction: vi.fn(), listTasks: vi.fn(), getTaskState: vi.fn(), stepTask: vi.fn(), stopTask: vi.fn(), getBrowserStatus: vi.fn(), openBrowserUrl: vi.fn(), readCurrentPage: vi.fn() } }));
vi.mock('./ChatController', () => ({ chatController: { onUpdated: mocks.onUpdated, applyTaskEvent: vi.fn(), sendMessage: vi.fn(), appendTaskResult: mocks.appendTaskResult, getHistory: vi.fn() } }));
vi.mock('./BrowserSessionController', () => ({ browserSessionController: { setWindow: vi.fn(), attachToViewport: vi.fn(), show: vi.fn(), hide: vi.fn(), getStatus: vi.fn(), openUrl: vi.fn(), readCurrentPage: vi.fn(), extractLinks: vi.fn() } }));
vi.mock('../files/FileIngestion', () => ({ ingestFile: vi.fn() }));
vi.mock('../store/fileStore', () => ({ fileStore: { saveFileRecord: vi.fn() } }));
vi.mock('../model/LlamaServerManager', () => ({ LlamaServerManager: class { getStatus(){return{};} ensureRunning=vi.fn(); stop=vi.fn(); getLogs=vi.fn(); } }));
vi.mock('../store/modelBackendStore', () => ({ modelBackendStore: { getConfig: ()=>({mode:'external_openai_compatible'}), saveConfig: vi.fn() } }));
vi.mock('../model/LocalAssetManager', () => ({ LocalAssetManager: class { onUpdate(){} getStatus(){return{};} ensureAssetsReady=vi.fn(); cancelDownload=vi.fn(); selectModelFile=vi.fn(); selectServerBinary=vi.fn(); getDiagnostics=vi.fn(); } }));
vi.mock('../agent/diagnostics', () => ({ diagnostics: { getTaskDebugDir: vi.fn() } }));
vi.mock('../browser/ManagedBrowser', () => ({ checkManagedBrowserReady: vi.fn(async()=>({status:'ready'})) }));
vi.mock('../diagnostics/logger', () => ({ logger: { logIpc: vi.fn(), logSetup: vi.fn(), logWarn: vi.fn() } }));

import { browserSessionController } from './BrowserSessionController';
import { registerIpc } from './ipc';

describe('ipc chat handlers', () => {
  beforeEach(() => { mocks.handlers.clear(); vi.clearAllMocks(); registerIpc({ webContents: { send: mocks.send } } as any); });
  it('chat:reject awaits rejectAction before appendTaskResult', async () => { mocks.rejectAction.mockResolvedValue({ task: { id: 't_1' } }); await mocks.handlers.get('chat:reject')({}, 't_1', 'p_1'); expect(mocks.appendTaskResult).toHaveBeenCalledWith(expect.objectContaining({ task: expect.any(Object) })); });
  it('chat:answer does not run task twice', async () => { mocks.answerUserQuestion.mockResolvedValue({ task: { id: 't_1' } }); await mocks.handlers.get('chat:answer')({}, 't_1', 'yes'); expect(mocks.runTask).not.toHaveBeenCalled(); });
  it('browser:readCurrentPage uses browser session controller', async () => { await mocks.handlers.get('browser:readCurrentPage')({}); expect((browserSessionController as any).readCurrentPage).toHaveBeenCalled(); });
});
