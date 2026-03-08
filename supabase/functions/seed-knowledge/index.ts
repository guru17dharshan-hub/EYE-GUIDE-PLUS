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
    body: JSON.stringify({ model: "text-embedding-004", input: text }),
  });
  if (!response.ok) {
    await response.text();
    return [];
  }
  const data = await response.json();
  return data.data[0].embedding;
}

const SEED_DATA = [
  {
    title: "Bus Boarding Guide",
    category: "transit",
    content: `How to board a bus safely as a visually impaired person. When approaching a bus stop, listen for engine sounds to determine when a bus is arriving. Most city buses announce their route number through an external speaker. If you cannot hear the announcement, ask a nearby person or use the EyeGuide camera to identify the bus number. When the bus stops, the door will open on your right side. Feel for the edge of the curb and step up carefully. Most buses have one or two steps up. Hold the handrail on your right as you enter. Once inside, the fare machine or card reader is typically on your right just inside the door. After paying, walk forward slowly. Most buses have priority seating near the front on both sides. If the priority seats are taken, continue down the aisle with one hand on the overhead bar. Press the stop request button when your stop is announced.`,
  },
  {
    title: "Navigation Safety Tips",
    category: "safety",
    content: `Safety tips for visually impaired navigation. Always carry a white cane or use a guide dog when navigating outdoors. At intersections, listen for traffic flow patterns before crossing. Accessible pedestrian signals make a locator tone and a walk indication tone. At crosswalks, walk in a straight line perpendicular to the curb. Be aware of construction zones which may have temporary barriers. Listen for sounds that indicate obstacles like idling vehicles or air conditioning units. In unfamiliar areas, ask for assistance from passersby. When walking along sidewalks, stay to the right side. Watch for street furniture like benches, bollards, and bike racks.`,
  },
  {
    title: "Accessibility Features on Public Transit",
    category: "accessibility",
    content: `Accessibility features available on modern public transit. Buses are equipped with automated stop announcements. Priority seating near the front is reserved for elderly and disabled passengers. Buses have wheelchair ramps or kneeling features. Inside the bus, yellow textured strips indicate step areas. Handrails are on both sides of the aisle. Stop request buttons are on vertical poles and along windows. Many transit systems offer trip planning apps with accessibility features. Paratransit services are available for those who cannot use fixed routes. Fare assistance programs are available for disabled riders.`,
  },
  {
    title: "Finding and Using Bus Stops",
    category: "transit",
    content: `How to find and use bus stops. Bus stops are typically marked with a sign post on the sidewalk. Many stops have a shelter with a bench. Tactile paving with raised bumps is often present at bus stops. When waiting, stand near the sign post so the driver can see you. Signal the driver by extending your arm when you hear the bus approaching. Some transit systems have real-time arrival info through apps. At major stops, electronic signs show next bus arrivals. If unsure which bus arrived, ask the driver. Bus shelters usually have a bench on one side and an opening for boarding.`,
  },
  {
    title: "Indoor Navigation Tips",
    category: "safety",
    content: `Tips for navigating indoor spaces. When entering a building, pause to orient yourself. Listen for echoes to gauge the size of the space. Most public buildings have information desks near the entrance. Elevators have Braille labels and audio floor announcements. Escalators can be identified by their humming sound. Always use handrails on stairs. In shopping centers, store entrances often have different flooring textures. Restrooms have Braille and raised lettering. If lost indoors, ask staff or find a wall to follow.`,
  },
  {
    title: "Emergency Procedures",
    category: "safety",
    content: `Emergency procedures for visually impaired users. In an emergency on a bus, the driver will give instructions. Emergency exits are at the rear and sometimes mid-vehicle with red handles and tactile markings. If you need to evacuate, feel for the nearest exit. In a medical emergency, call emergency services. Always carry an ID card with emergency contacts and medical conditions. Use the EyeGuide SOS feature to alert your emergency contacts with GPS location. In severe weather, seek shelter immediately. If lost, use the app to share your location with a contact.`,
  },
];

// Chunk text into ~400 char pieces with 50 char overlap
function chunkText(text: string): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + 400, text.length);
    const chunk = text.slice(start, end).trim();
    if (chunk.length > 20) chunks.push(chunk);
    start = end - 50;
    if (start >= text.length) break;
  }
  return chunks;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Accept a batch index (0-5) to process one document at a time
    let body: { batch?: number } = {};
    try { body = await req.json(); } catch { /* empty body is fine */ }
    const batchIndex = body.batch ?? -1;

    // Check what's already seeded
    const { data: existingDocs } = await supabase
      .from("knowledge_documents")
      .select("title")
      .eq("source", "seed");

    const existingTitles = new Set((existingDocs || []).map((d: { title: string }) => d.title));

    // If batch=-1, return status of what needs seeding
    if (batchIndex === -1) {
      const remaining = SEED_DATA
        .map((item, i) => ({ index: i, title: item.title, seeded: existingTitles.has(item.title) }));
      const needsSeeding = remaining.filter((r) => !r.seeded);

      if (needsSeeding.length === 0) {
        return new Response(
          JSON.stringify({ message: "Knowledge base already fully seeded", done: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ remaining: needsSeeding, total: SEED_DATA.length, done: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Process a single document
    if (batchIndex < 0 || batchIndex >= SEED_DATA.length) {
      return new Response(
        JSON.stringify({ error: "Invalid batch index" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const item = SEED_DATA[batchIndex];

    if (existingTitles.has(item.title)) {
      return new Response(
        JSON.stringify({ message: `"${item.title}" already seeded`, skipped: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create document
    const { data: doc, error: docErr } = await supabase
      .from("knowledge_documents")
      .insert({ title: item.title, source: "seed", category: item.category })
      .select()
      .single();

    if (docErr) throw new Error(`Doc insert error: ${docErr.message}`);

    const chunks = chunkText(item.content);
    let embeddedCount = 0;

    for (const chunk of chunks) {
      const embedding = await getEmbedding(chunk, LOVABLE_API_KEY);
      await supabase.from("knowledge_chunks").insert({
        document_id: doc.id,
        content: chunk,
        embedding: embedding.length > 0 ? JSON.stringify(embedding) : null,
      });
      embeddedCount++;
      await new Promise((r) => setTimeout(r, 250));
    }

    return new Response(
      JSON.stringify({
        success: true,
        title: item.title,
        chunks: embeddedCount,
        batch: batchIndex,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("seed-knowledge error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
