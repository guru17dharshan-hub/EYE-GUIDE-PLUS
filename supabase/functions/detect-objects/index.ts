import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { image, boarding_context } = await req.json();
    if (!image) {
      return new Response(JSON.stringify({ error: "No image provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Build context-aware prompt based on boarding phase
    const contextPrompt = boarding_context
      ? `\n\nCURRENT BOARDING PHASE: "${boarding_context.phase}"\nSPECIFIC TASK: ${boarding_context.prompt}\n\nAdapt your response to help with this specific phase. Include a "boarding_phase_hint" field suggesting the next phase: "detected", "approaching", "boarding", "finding_seat", or "seated" based on what you see.`
      : "";

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
            {
              role: "system",
              content: `You are an accessibility assistant for visually impaired users navigating public transit. The phone may be clipped to the user's chest or held in a pocket with the camera facing outward. Analyze the camera image and report ONLY what is immediately relevant for navigation safety.

Respond with a JSON object with these fields:
- "objects": array of detected objects relevant to transit. Each object should be { "name": string, "direction": string } where direction is relative position like "ahead", "on your left", "on your right", "behind". Include: buses, seats (empty/occupied), doors (open/closed), obstacles, poles, handrails, steps, gaps, curbs, people, bags in aisle.
- "alert": a short spoken alert (max 25 words) for the user. Be direct and actionable. Use spatial directions: "Empty seat on your left, 1 meter away. Pole ahead — move right." If nothing notable, say "Path is clear ahead."
- "urgency": "high" (immediate danger/bus door opening/obstacle in path), "medium" (useful info like available seat or approaching stop), or "low" (nothing notable)
- "boarding_phase_hint": suggest the current boarding state based on what you see. One of: "detected" (bus visible), "approaching" (bus getting closer/door visible in distance), "boarding" (at the door/steps, door is open), "finding_seat" (inside bus interior), "seated" (person appears seated). Omit if no bus context.
- "seat_direction": if an empty seat is visible, describe its exact position relative to the user, e.g. "on your left, about 1 meter" or "two rows ahead on the right". Omit if no seat visible.
- "next_stop": if a digital display or announcement showing the next stop is visible, include the stop name. Omit if not visible.
- "obstacles": array of obstacle descriptions like "pole 50cm ahead on right", "bag in aisle on left". Omit if none.

Return ONLY valid JSON, no markdown.${contextPrompt}`,
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: boarding_context?.prompt || "Analyze this camera frame for buses, seats, obstacles, and navigation hazards.",
                },
                {
                  type: "image_url",
                  image_url: { url: image },
                },
              ],
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limited, please wait." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add funds." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(
        JSON.stringify({ error: "AI analysis failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    let result;
    try {
      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      result = JSON.parse(cleaned);
    } catch {
      result = {
        objects: [],
        alert: content.slice(0, 100) || "Unable to analyze frame.",
        urgency: "low",
      };
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("detect-objects error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
