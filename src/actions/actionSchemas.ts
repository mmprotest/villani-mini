import { z } from 'zod';

const proposalMeta = z.object({
  title:z.string().min(3),
  reason:z.string().min(3),
  expectedOutcome:z.string().min(3),
  riskLevel:z.enum(['low','medium','high']).optional(),
  requiresApproval:z.boolean().optional(),
  reversibility:z.enum(['reversible','irreversible']).optional(),
  evidenceRefs:z.array(z.string()).optional()
});

export const finalAnswerPayloadSchema = z.object({ summary:z.string().min(1), evidenceRefs:z.array(z.string()).default([]), remainingSteps:z.array(z.string()).default([]), uncertainty:z.string().default(''), blockedReason:z.string().optional() });

export const actionSchema = z.discriminatedUnion('type',[
 z.object({type:z.literal('open_url'),params:z.object({url:z.string().url()}),meta:proposalMeta.optional()}),
 z.object({type:z.literal('read_current_page'),params:z.object({}),meta:proposalMeta.optional()}),
 z.object({type:z.literal('click_candidate'),params:z.object({candidateId:z.string()}),meta:proposalMeta.optional()}),
 z.object({type:z.literal('fill_field'),params:z.object({fieldId:z.string(),value:z.string(),valueDescription:z.string().optional()}),meta:proposalMeta.optional()}),
 z.object({type:z.literal('pause_for_user_login'),params:z.object({message:z.string()}),meta:proposalMeta.optional()}),
 z.object({type:z.literal('ask_user'),params:z.object({question:z.string(),options:z.array(z.string()).optional()}),meta:proposalMeta.optional()}),
 z.object({type:z.literal('create_note'),params:z.object({title:z.string(),content:z.string()}),meta:proposalMeta.optional()}),
 z.object({type:z.literal('final_answer'),params:finalAnswerPayloadSchema,meta:proposalMeta.optional()})
]);

export type AgentAction = z.infer<typeof actionSchema>;
