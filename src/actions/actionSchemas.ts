import { z } from 'zod';
export const actionSchema = z.discriminatedUnion('type',[
 z.object({type:z.literal('open_url'),params:z.object({url:z.string().url()})}),
 z.object({type:z.literal('read_current_page'),params:z.object({})}),
 z.object({type:z.literal('click_candidate'),params:z.object({candidateId:z.string()})}),
 z.object({type:z.literal('fill_field'),params:z.object({fieldId:z.string(),value:z.string(),valueDescription:z.string().optional()})}),
 z.object({type:z.literal('pause_for_user_login'),params:z.object({message:z.string()})}),
 z.object({type:z.literal('ask_user'),params:z.object({question:z.string(),options:z.array(z.string()).optional()})}),
 z.object({type:z.literal('create_note'),params:z.object({title:z.string(),content:z.string()})}),
 z.object({type:z.literal('final_answer'),params:z.object({summary:z.string(),remainingSteps:z.array(z.string()),uncertainty:z.string().optional()})})
]);
