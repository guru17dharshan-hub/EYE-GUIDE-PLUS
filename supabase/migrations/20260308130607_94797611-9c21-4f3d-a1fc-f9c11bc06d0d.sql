
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- Knowledge base documents table
CREATE TABLE public.knowledge_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual', -- 'manual', 'upload', 'seed'
  category TEXT NOT NULL DEFAULT 'general', -- 'transit', 'safety', 'accessibility', 'general'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Document chunks with embeddings
CREATE TABLE public.knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES public.knowledge_documents(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  embedding vector(768),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast similarity search
CREATE INDEX ON public.knowledge_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Match function for similarity search
CREATE OR REPLACE FUNCTION public.match_knowledge(
  query_embedding vector(768),
  match_threshold FLOAT DEFAULT 0.5,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  document_id UUID,
  content TEXT,
  similarity FLOAT
)
LANGUAGE sql STABLE
AS $$
  SELECT
    kc.id,
    kc.document_id,
    kc.content,
    1 - (kc.embedding <=> query_embedding) AS similarity
  FROM public.knowledge_chunks kc
  WHERE 1 - (kc.embedding <=> query_embedding) > match_threshold
  ORDER BY kc.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- RLS: knowledge is public read, no auth needed for this accessibility app
ALTER TABLE public.knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read knowledge documents" ON public.knowledge_documents FOR SELECT USING (true);
CREATE POLICY "Anyone can insert knowledge documents" ON public.knowledge_documents FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can delete knowledge documents" ON public.knowledge_documents FOR DELETE USING (true);

CREATE POLICY "Anyone can read knowledge chunks" ON public.knowledge_chunks FOR SELECT USING (true);
CREATE POLICY "Anyone can insert knowledge chunks" ON public.knowledge_chunks FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can delete knowledge chunks" ON public.knowledge_chunks FOR DELETE USING (true);
