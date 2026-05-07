import { describe, it, expect } from 'vitest';
import { routeChatIntent } from '../src/main/chatRouting';

describe('chat routing', () => {
  it('routes normal chat', () => expect(routeChatIntent('How does this work?').kind).toBe('chat'));
  it('routes actionable task', () => expect(routeChatIntent('Open example.com and summarize this website').kind).toBe('task'));
  it('routes ambiguous to clarify', () => expect(routeChatIntent('Can you check how this works?').kind).toBe('clarify'));
});
