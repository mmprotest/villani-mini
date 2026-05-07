import { expect,test } from 'vitest';
import { evaluateActionPermission, permissionFor, requiresApproval } from '../src/actions/permissionEngine';

const snapshot = {
  snapshotId: 's1', url: 'https://example.com', title: 'Example', status: 'ok' as const,
  clickableCandidates: [
    { id:'c_safe', role:'button', label:'Learn more', text:'Learn more', riskHints:[], isSubmitLike:false, isDangerous:false, reasonFlags:[] },
    { id:'c_submit', role:'button', label:'Submit order', text:'Submit order', riskHints:['submit_like'], isSubmitLike:true, isDangerous:false, reasonFlags:['submit_like'] },
    { id:'c_danger', role:'button', label:'Delete account', text:'Delete account', riskHints:['dangerous'], isSubmitLike:false, isDangerous:true, reasonFlags:['dangerous'] },
  ],
  formFields: [
    { id:'f_public', label:'Nickname', type:'text', sensitive:false },
    { id:'f_secret', label:'Password', type:'password', sensitive:true },
  ]
};

test('open_url low-risk http/https is auto allowed',()=>{
  expect(permissionFor('open_url')).toBe('allow');
  expect(requiresApproval('open_url',{url:'https://example.com'},'low')).toBe(false);
  expect(requiresApproval('open_url',{url:'http://example.com'},'low')).toBe(false);
});

test('dangerous candidate requires approval from runtime candidate, not model flags',()=>{
  const out = evaluateActionPermission('click_candidate',{candidateId:'c_danger'},'low',{snapshot});
  expect(out.requiresApproval).toBe(true);
  expect(out.riskReasons).toContain('dangerous_candidate');
});

test('submit-like candidate requires approval',()=>{
  const out = evaluateActionPermission('click_candidate',{candidateId:'c_submit'},'low',{snapshot});
  expect(out.requiresApproval).toBe(true);
  expect(out.riskReasons).toContain('submit_like');
});

test('safe candidate can execute without approval if policy allows',()=>{
  const out = evaluateActionPermission('click_candidate',{candidateId:'c_safe'},'low',{snapshot});
  expect(out.canExecute).toBe(true);
  expect(out.requiresApproval).toBe(false);
});

test('missing candidate and stale snapshot fail safely',()=>{
  const missing = evaluateActionPermission('click_candidate',{candidateId:'c_missing'},'low',{snapshot});
  expect(missing.canExecute).toBe(false);
  expect(missing.failureReason).toMatch(/not found/i);
  const stale = evaluateActionPermission('click_candidate',{candidateId:'c_safe', expectedSnapshotId:'old'},'low',{snapshot});
  expect(stale.canExecute).toBe(false);
  expect(stale.failureReason).toMatch(/stale snapshot/i);
});

test('sensitive fill_field requires approval',()=>{
  const out = evaluateActionPermission('fill_field',{fieldId:'f_secret', value:'top-secret'},'low',{snapshot});
  expect(out.requiresApproval).toBe(true);
  expect(out.riskReasons.join(' ')).toMatch(/sensitive/i);
});
