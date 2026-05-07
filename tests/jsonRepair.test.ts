import { expect,test } from 'vitest'; import { jsonRepair } from '../src/model/jsonRepair';
test('invalid JSON does not invent ask_user',()=>expect(()=>jsonRepair('{')).toThrow(/invalid_json/));
