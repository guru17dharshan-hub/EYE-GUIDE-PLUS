import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
    console.error("Embedding failed:", response.status);
    return [];
  }

  const data = await response.json();
  return data.data[0].embedding;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { question, language } = await req.json();
    if (!question) {
      return new Response(JSON.stringify({ error: "No question provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Language mapping for stronger instruction
    const LANG_NAMES: Record<string, string> = {
      ta: "Tamil (தமிழ்)", hi: "Hindi (हिन्दी)", te: "Telugu (తెలుగు)",
      kn: "Kannada (ಕನ್ನಡ)", ml: "Malayalam (മലയാളം)", es: "Spanish",
      fr: "French", ar: "Arabic (العربية)", zh: "Chinese (中文)",
    };
    const langCode = language || "en";
    const langName = LANG_NAMES[langCode] || null;
    const langInstruction = langName
      ? `\n\nCRITICAL LANGUAGE REQUIREMENT: You MUST respond ENTIRELY in ${langName}. Every single word of your response must be in ${langName}. Do NOT use English at all. This is mandatory.`
      : "";

    // --- RAG: Retrieve relevant knowledge ---
    let contextText = "";
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      const queryEmbedding = await getEmbedding(question, LOVABLE_API_KEY);

      if (queryEmbedding.length > 0) {
        const { data: matches, error: matchError } = await supabase.rpc(
          "match_knowledge",
          {
            query_embedding: JSON.stringify(queryEmbedding),
            match_threshold: 0.4,
            match_count: 5,
          }
        );

        if (!matchError && matches && matches.length > 0) {
          contextText = matches
            .map((m: { content: string; similarity: number }) => m.content)
            .join("\n\n");
          console.log(`RAG: Found ${matches.length} relevant chunks`);
        }
      }
    } catch (ragError) {
      console.error("RAG retrieval failed (falling back to base AI):", ragError);
    }

    // --- Generate answer with or without context ---
    const systemPrompt = contextText
      ? `You are a helpful voice assistant for visually impaired users. You answer questions clearly and concisely in 1-3 short sentences, optimized for being read aloud by text-to-speech.

You have access to a knowledge base with relevant information. Use the following context to provide accurate answers. If the context doesn't cover the question, answer from your general knowledge but mention you're not sure.

KNOWLEDGE BASE CONTEXT:
${contextText}

Key rules:
- Keep answers brief and spoken-friendly (no bullet points, no markdown, no lists)
- Use simple, clear language
- Prioritize information from the knowledge base when available
- If asked about directions or navigation, give clear spatial guidance
- Be warm and reassuring in tone
- Never say "I can see" or reference visual content unless given an image${langInstruction}`
      : `You are a helpful voice assistant for visually impaired users. You answer questions clearly and concisely in 1-3 short sentences, optimized for being read aloud by text-to-speech. 

Key rules:
- Keep answers brief and spoken-friendly (no bullet points, no markdown, no lists)
- Use simple, clear language
- If asked about directions or navigation, give clear spatial guidance
- If asked about time, weather, general knowledge — answer directly
- Be warm and reassuring in tone
- Never say "I can see" or reference visual content unless given an image${langInstruction}`;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: question },
          ],
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limited, please wait a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(
        JSON.stringify({ error: "AI failed to respond" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const answer =
      data.choices?.[0]?.message?.content || "Sorry, I could not find an answer.";

    return new Response(
      JSON.stringify({ answer, has_context: contextText.length > 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("ask-ai error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
