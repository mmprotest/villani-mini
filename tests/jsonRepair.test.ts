import { expect,test } from 'vitest'; import { jsonRepair } from '../src/model/jsonRepair'; test('invalid JSON repair fallback works',()=>expect((jsonRepair('{') as any).type).toBe('ask_user'));
