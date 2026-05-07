import { expect,test } from 'vitest';
import { permissionFor, requiresApproval } from '../src/actions/permissionEngine';

test('open_url low-risk http/https is auto allowed',()=>{
  expect(permissionFor('open_url')).toBe('allow');
  expect(requiresApproval('open_url',{url:'https://example.com'},'low')).toBe(false);
  expect(requiresApproval('open_url',{url:'http://example.com'},'low')).toBe(false);
});

test('dangerous schemes and sensitive navigation require approval',()=>{
  expect(requiresApproval('open_url',{url:'javascript:alert(1)'},'low')).toBe(true);
  expect(requiresApproval('open_url',{url:'file:///tmp/a.txt'},'low')).toBe(true);
  expect(requiresApproval('open_url',{url:'https://pay.example.com/checkout'},'low')).toBe(true);
  expect(requiresApproval('open_url',{url:'https://example.com/delete-account'},'low')).toBe(true);
});

test('safe auto-allow actions and submit-like click approval',()=>{
  expect(permissionFor('read_current_page')).toBe('allow');
  expect(permissionFor('final_answer')).toBe('allow');
  expect(permissionFor('ask_user')).toBe('allow');
  expect(requiresApproval('click_candidate',{candidateId:'c1',isSubmitLike:true},'low')).toBe(true);
});
