import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Split text into chunks of ~500 chars with overlap
function chunkText(text: string, chunkSize = 500, overlap = 50): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end).trim());
    start = end - overlap;
    if (start >= text.length) break;
  }
  return chunks.filter((c) => c.length > 20);
}

// Get embedding from Lovable AI using Gemini's embedding
async function getEmbedding(text: string, apiKey: string): Promise<number[]> {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-004",
      input: text,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Embedding failed (${response.status}): ${err}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { title, content, category, source } = await req.json();

    if (!title || !content) {
      return new Response(
        JSON.stringify({ error: "title and content are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Create document record
    const { data: doc, error: docError } = await supabase
      .from("knowledge_documents")
      .insert({ title, source: source || "manual", category: category || "general" })
      .select()
      .single();

    if (docError) throw new Error(`Failed to create document: ${docError.message}`);

    // 2. Chunk the content
    const chunks = chunkText(content);

    // 3. Embed each chunk and store
    const chunkRecords = [];
    for (const chunk of chunks) {
      try {
        const embedding = await getEmbedding(chunk, LOVABLE_API_KEY);
        chunkRecords.push({
          document_id: doc.id,
          content: chunk,
          embedding: JSON.stringify(embedding),
        });
      } catch (e) {
        console.error("Embedding error for chunk:", e);
        // Store without embedding rather than failing entirely
        chunkRecords.push({
          document_id: doc.id,
          content: chunk,
          embedding: null,
        });
      }

      // Small delay to avoid rate limiting
      await new Promise((r) => setTimeout(r, 200));
    }

    const { error: insertError } = await supabase
      .from("knowledge_chunks")
      .insert(chunkRecords);

    if (insertError) throw new Error(`Failed to insert chunks: ${insertError.message}`);

    return new Response(
      JSON.stringify({
        success: true,
        document_id: doc.id,
        chunks_count: chunkRecords.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("embed-document error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
