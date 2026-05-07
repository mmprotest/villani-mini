import { z } from 'zod';
export const setupStatusSchema = z.enum(['not_started','checking','downloading','verifying','starting','ready','error']);
