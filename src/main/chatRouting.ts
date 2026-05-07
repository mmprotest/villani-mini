export type ChatRoute =
  | { kind: 'chat' }
  | { kind: 'task'; taskTitle: string; taskInstruction: string }
  | { kind: 'clarify'; question: string };

const taskPatterns = [
  'open','go to','browse','find','search','read this page','summarize this website','click','fill','compare','download','create a note','inspect','check','look up','use the browser','use the app','do this','book','buy','send','submit'
];

const chatPatterns = [
  'hello','hi ','hey','what do you think','how does this work','brainstorm','advice','explain'
];

export function routeChatIntent(message: string): ChatRoute {
  const m = message.trim().toLowerCase();
  if (!m) return { kind: 'clarify', question: 'Do you want me to answer, or do you want me to take action?' };
  const taskHit = taskPatterns.some((p) => m.includes(p));
  const chatHit = chatPatterns.some((p) => m.includes(p)) || (m.endsWith('?') && !/(open|search|find|click|fill|download|book|buy|submit)/.test(m));
  if (taskHit && !chatHit) return { kind: 'task', taskTitle: message.slice(0, 60), taskInstruction: message };
  if (chatHit && !taskHit) return { kind: 'chat' };
  if (taskHit && chatHit) return { kind: 'clarify', question: 'Do you want me to answer, or do you want me to take action?' };
  return { kind: 'chat' };
}
