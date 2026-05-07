import { z } from 'zod';
export const setupStatusSchema = z.enum(['checking','downloading_model','validating_model','starting_runtime','ready','failed']);
