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
  if (!response.ok) return [];
  const data = await response.json();
  return data.data[0].embedding;
}

const SEED_DATA = [
  {
    title: "Bus Boarding Guide",
    category: "transit",
    content: `How to board a bus safely as a visually impaired person. When approaching a bus stop, listen for engine sounds to determine when a bus is arriving. Most city buses announce their route number through an external speaker. If you cannot hear the announcement, ask a nearby person or use the EyeGuide camera to identify the bus number. When the bus stops, the door will open on your right side. Feel for the edge of the curb and step up carefully. Most buses have one or two steps up. Hold the handrail on your right as you enter. Once inside, the fare machine or card reader is typically on your right just inside the door. After paying, walk forward slowly. Most buses have priority seating near the front on both sides, clearly marked for accessibility. If the priority seats are taken, continue down the aisle with one hand on the overhead bar or seat backs for balance. Listen for the driver's announcements for your stop. Most buses also have a digital display and audio announcement system. Press the stop request button or pull the cord when your stop is announced. The button is usually on the vertical poles or along the windows.`,
  },
  {
    title: "Navigation Safety Tips",
    category: "safety",
    content: `Safety tips for visually impaired navigation. Always carry a white cane or use a guide dog when navigating outdoors. At intersections, listen for traffic flow patterns before crossing. Accessible pedestrian signals make a locator tone and a walk indication tone. The locator tone is a repeating sound that helps you find the signal button. At crosswalks, walk in a straight line perpendicular to the curb. If you feel yourself veering, stop and realign. Be aware of construction zones which may have temporary barriers. Listen for sounds that indicate obstacles like idling vehicles, water fountains, or air conditioning units. In unfamiliar areas, ask for assistance from passersby. Most people are happy to help with directions. When walking along sidewalks, stay to the right side. Watch for street furniture like benches, bollards, trash cans, and bike racks which may be in your path. Be extra cautious at driveways and parking lot entrances where cars may be turning.`,
  },
  {
    title: "Accessibility Features on Public Transit",
    category: "accessibility",
    content: `Accessibility features available on modern public transit. Buses are equipped with automated stop announcements that call out each stop name before arrival. Priority seating near the front is reserved for elderly and disabled passengers. Buses have wheelchair ramps or kneeling features that lower the bus for easier boarding. The driver can deploy the ramp by request. Inside the bus, yellow textured strips on the floor edge indicate step areas. Handrails are located on both sides of the aisle and on seat backs. Stop request buttons are placed on vertical poles and along windows at regular intervals. Some newer buses have tactile maps near the entrance showing the route. Many transit systems offer trip planning apps with accessibility features. Paratransit services are available for those who cannot use fixed routes. To use paratransit, register with your local transit authority. Fare assistance programs are available for disabled riders in most cities.`,
  },
  {
    title: "Finding and Using Bus Stops",
    category: "transit",
    content: `How to find and use bus stops. Bus stops are typically marked with a sign post on the sidewalk. Many stops have a shelter with a bench. Tactile paving (raised bumps on the ground) is often present at bus stops to indicate the boarding area. When waiting at a stop, stand near the sign post so the driver can see you. You can signal the driver by extending your arm when you hear the bus approaching. Some transit systems have real-time arrival information available through smartphone apps or text messages. At major stops, there may be electronic signs showing next bus arrivals. If you are unsure which bus has arrived, ask the driver to announce the route number. Some cities have talking bus stop signs that announce arrivals. Bus shelters usually have a bench on one side and an opening on the other for boarding. The boarding area is typically at the front of the shelter nearest to the direction of travel.`,
  },
  {
    title: "Indoor Navigation Tips",
    category: "safety",
    content: `Tips for navigating indoor spaces. When entering a building, pause briefly to orient yourself. Listen for echoes to gauge the size of the space. Most public buildings have information desks near the entrance. Elevators typically have Braille labels on buttons and audio floor announcements. Escalators can be identified by their distinctive humming sound. Always use handrails on stairs and escalators. In shopping centers, store entrances often have different flooring textures. Restrooms in public buildings are usually signed with Braille and raised lettering. If lost indoors, ask staff for directions or find a wall to follow. Most buildings have tactile floor indicators leading to exits and important facilities.`,
  },
  {
    title: "Emergency Procedures",
    category: "safety",
    content: `Emergency procedures for visually impaired users. In an emergency on a bus, the driver will give instructions. Emergency exits on buses are located at the rear and sometimes mid-vehicle. Emergency exit handles are painted red and have tactile markings. If you need to evacuate, feel for the nearest exit and follow other passengers. In case of a medical emergency, call emergency services or ask someone to call. Always carry an ID card with your emergency contact information and any medical conditions. If you feel unsafe at any location, use the EyeGuide SOS feature to alert your emergency contacts. The app will share your GPS location with them. In severe weather, seek shelter immediately. Listen to weather alerts on your phone. If you get lost, stay calm and use the EyeGuide app to share your location with a contact who can guide you.`,
  },
];

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

    // Check if already seeded
    const { count } = await supabase
      .from("knowledge_documents")
      .select("*", { count: "exact", head: true })
      .eq("source", "seed");

    if (count && count > 0) {
      return new Response(
        JSON.stringify({ message: "Knowledge base already seeded", count }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let totalChunks = 0;

    for (const item of SEED_DATA) {
      // Create document
      const { data: doc, error: docErr } = await supabase
        .from("knowledge_documents")
        .insert({ title: item.title, source: "seed", category: item.category })
        .select()
        .single();

      if (docErr) {
        console.error("Doc insert error:", docErr);
        continue;
      }

      // Chunk content (~500 chars)
      const chunks: string[] = [];
      let start = 0;
      while (start < item.content.length) {
        const end = Math.min(start + 500, item.content.length);
        const chunk = item.content.slice(start, end).trim();
        if (chunk.length > 20) chunks.push(chunk);
        start = end - 50;
        if (start >= item.content.length) break;
      }

      for (const chunk of chunks) {
        try {
          const embedding = await getEmbedding(chunk, LOVABLE_API_KEY);
          await supabase.from("knowledge_chunks").insert({
            document_id: doc.id,
            content: chunk,
            embedding: embedding.length > 0 ? JSON.stringify(embedding) : null,
          });
          totalChunks++;
        } catch (e) {
          console.error("Chunk embed error:", e);
          await supabase.from("knowledge_chunks").insert({
            document_id: doc.id,
            content: chunk,
            embedding: null,
          });
          totalChunks++;
        }
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        documents: SEED_DATA.length,
        total_chunks: totalChunks,
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
