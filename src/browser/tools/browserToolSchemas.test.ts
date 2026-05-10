import { describe,it,expect } from 'vitest';import { browserToolSchemas } from './browserToolSchemas';
describe('browserToolSchemas',()=>{it('validates open_url',()=>{expect(browserToolSchemas.browser_open_url.safeParse({url:'https://example.com',reason:'go'}).success).toBe(true);expect(browserToolSchemas.browser_open_url.safeParse({url:'x',reason:'go'}).success).toBe(false);});});
