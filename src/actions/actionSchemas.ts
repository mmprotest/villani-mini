import { z } from 'zod';

const proposalMeta = z.object({
  title:z.string().min(1).optional(), reason:z.string().min(1).optional(), expectedOutcome:z.string().min(1).optional(),
  riskLevel:z.enum(['low','medium','high']).optional(), requiresApproval:z.boolean().optional(), reversible:z.boolean().optional(), evidenceRefs:z.array(z.string()).optional()
});

export const finalAnswerPayloadSchema = z.object({
  summary:z.string().min(1), evidenceRefs:z.array(z.string()), remainingSteps:z.array(z.string()), uncertainty:z.enum(['low','medium','high']), blockedReason:z.string().optional()
});

export const actionSchema = z.discriminatedUnion('type',[
 z.object({type:z.literal('open_url'),params:z.object({url:z.string().url()}),meta:proposalMeta.optional()}),
 z.object({type:z.literal('read_current_page'),params:z.object({}),meta:proposalMeta.optional()}),
 z.object({type:z.literal('click_candidate'),params:z.object({candidateId:z.string(),snapshotId:z.string().optional(),expectedSnapshotId:z.string().optional()}),meta:proposalMeta.optional()}),
 z.object({type:z.literal('fill_field'),params:z.object({fieldId:z.string(),value:z.string(),valueDescription:z.string().optional(),snapshotId:z.string().optional(),expectedSnapshotId:z.string().optional()}),meta:proposalMeta.optional()}),
 z.object({type:z.literal('ask_user'),params:z.object({question:z.string(),options:z.array(z.string()).optional()}),meta:proposalMeta.optional()}),
 z.object({type:z.literal('final_answer'),params:finalAnswerPayloadSchema,meta:proposalMeta.optional()})
]);

export type AgentAction = z.infer<typeof actionSchema>;
