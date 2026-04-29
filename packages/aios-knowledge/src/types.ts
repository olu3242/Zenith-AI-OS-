import { z } from 'zod';

export const KnowledgeSourceTypeSchema = z.enum(['document', 'url', 'database', 'manual']);
export type KnowledgeSourceType = z.infer<typeof KnowledgeSourceTypeSchema>;

export const KnowledgeChunkSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  sourceId: z.string(),
  sourceType: KnowledgeSourceTypeSchema,
  content: z.string(),
  summary: z.string().optional(),
  embedding: z.array(z.number()).optional(),
  trustScore: z.number().min(0).max(1),
  provenance: z.string(),
  tags: z.array(z.string()).default([]),
  metadata: z.record(z.unknown()).default({}),
  createdAt: z.date(),
});

export type KnowledgeChunk = z.infer<typeof KnowledgeChunkSchema>;

export const KnowledgeSourceSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: KnowledgeSourceTypeSchema,
  organizationId: z.string(),
  metadata: z.record(z.unknown()).default({}),
});

export type KnowledgeSource = z.infer<typeof KnowledgeSourceSchema>;

export interface IngestInput {
  organizationId: string;
  sourceId: string;
  sourceType: KnowledgeSourceType;
  content: string;
  provenance: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface SearchInput {
  query: string;
  organizationId: string;
  limit?: number;
  trustThreshold?: number;
}

export interface HallucinationAssessment {
  grounded: boolean;
  supportingChunks: KnowledgeChunk[];
  confidence: number;
}
