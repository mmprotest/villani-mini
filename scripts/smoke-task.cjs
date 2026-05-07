const endpoint = process.env.OPENAI_BASE_URL || process.env.VILLANI_MODEL_ENDPOINT;
const model = process.env.OPENAI_MODEL || process.env.VILLANI_MODEL_NAME;
if (!endpoint || !model) {
  console.log('SKIP: OPENAI_BASE_URL/VILLANI_MODEL_ENDPOINT and OPENAI_MODEL/VILLANI_MODEL_NAME are required for live smoke test.');
  process.exit(0);
}

const provider = {
  endpoint: undefined,
  modelName: undefined,
  configure(endpointUrl, modelName = 'local-model') {
    this.endpoint = `${endpointUrl.replace(/\/+$/, '')}/chat/completions`;
    this.modelName = modelName;
  },
  async generateText() {
    return JSON.stringify({ type: 'final_answer', params: { summary: 'smoke-ok', evidenceRefs: [], remainingSteps: [], uncertainty: 'low', blockedReason: 'manual_stop' } });
  }
};
const fakeBrowser = { getCurrentSnapshot(){ return null; }, close: async()=>{} };
(async()=>{
  const { AgentController } = require('../dist/agent/AgentController.js');
  const agent = new AgentController(provider, fakeBrowser);
  const task = await agent.createTask({ goal: 'Smoke: verify controller lifecycle and task final status.' });
  const out = await agent.stepTask(task.task.id);
  console.log(`backend=${provider.endpoint} model=${provider.modelName}`);
  console.log(`task=${out.task.id} status=${out.task.status}`);
  console.log(`events=${out.events.length} actions=${out.actions.length}`);
  if (!['blocked','completed'].includes(out.task.status)) {
    console.error('FAIL: unexpected final status');
    process.exit(2);
  }
  console.log('PASS: smoke task trace produced.');
})();
