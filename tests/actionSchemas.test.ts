import { expect, test } from 'vitest'; import { actionSchema } from '../src/actions/actionSchemas';
test('open_url validation rejects bad URLs',()=>{ expect(()=>actionSchema.parse({type:'open_url',params:{url:'bad'}})).toThrow();});
