import { describe,it,expect } from 'vitest';import { BrowserFailureClassifier } from './BrowserFailureClassifier';
describe('BrowserFailureClassifier',()=>{it('counts repeated',()=>{const f=new BrowserFailureClassifier();expect(f.add('a')).toBe(1);expect(f.add('a')).toBe(2);expect(f.get('a')).toBe(2);});});
