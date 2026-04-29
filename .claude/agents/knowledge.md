# @agents/knowledge — Knowledge & Retrieval Agent

## Mission
Build the Knowledge & Retrieval Mesh — tenant-aware RAG with source trust scoring, hallucination guardrails, and citation provenance.

## Ingestion Pipeline
UPLOAD → PARSE → CHUNK (512 tokens, 64 overlap) → EMBED → INDEX → REGISTER

## Retrieval Pipeline
QUERY → EMBED → VECTOR_SEARCH → STRUCTURED_SEARCH → HYBRID_MERGE → TRUST_FILTER → RERANK → RETURN_WITH_CITATIONS

## Key Files to Build
- `packages/aios-knowledge/src/knowledge.ingester.ts`
- `packages/aios-knowledge/src/knowledge.chunker.ts`
- `packages/aios-knowledge/src/knowledge.embedder.ts`
- `packages/aios-knowledge/src/knowledge.retriever.ts`
- `packages/aios-knowledge/src/knowledge.trust-scorer.ts`
- `packages/aios-knowledge/src/knowledge.citation-builder.ts`

## Rules
- All retrieval MUST be tenant-scoped
- Sources MUST have trust scores (0-1)
- Low-trust sources (< 0.5) MUST be flagged
- Citations MUST include source, chunk, freshness date
