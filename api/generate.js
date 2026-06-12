// Vercel serverless functie — proxy naar Google "Nano Banana" (Gemini image).
// De API-key staat ALLEEN in de Vercel env var GEMINI_API_KEY, nooit in de browser.
// Patroon (model-fallbacklijst) overgenomen uit de bestaande, werkende
// linkedin-automation/pipeline/agents/book_cover_agent.py.

export const config = { maxDuration: 60 };

// Op volgorde geprobeerd tot er één een plaatje teruggeeft.
const MODELS = [
  "nano-banana-pro-preview",
  "gemini-2.5-flash-image",
  "gemini-2.5-flash-preview-05-20",
  "gemini-2.0-flash-exp",
];

// Houd het kindvriendelijk en veilig, ongeacht wat Usman intypt.
const VEILIG_PREFIX =
  "Maak een vrolijk, kleurrijk plaatje in een vriendelijke cartoon- of illustratiestijl, " +
  "geschikt voor een kind van 10 jaar. Geen enge, gewelddadige, bloederige of ongepaste " +
  "beelden, geen tekst in het plaatje. Onderwerp: ";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Gebruik POST." });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error: "De tovermachine is nog niet ingesteld (GEMINI_API_KEY ontbreekt in Vercel).",
    });
    return;
  }

  // Body kan al geparset zijn (Vercel) of nog een string.
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const wens = (body && typeof body.prompt === "string" ? body.prompt : "").trim();

  if (wens.length < 2) {
    res.status(400).json({ error: "Typ eerst wat je wilt zien." });
    return;
  }
  if (wens.length > 500) {
    res.status(400).json({ error: "Dat is wel een heel lange wens! Maak 'm wat korter." });
    return;
  }

  const prompt = VEILIG_PREFIX + wens;
  let laatsteFout = "onbekende fout";

  for (const model of MODELS) {
    try {
      const url =
        "https://generativelanguage.googleapis.com/v1beta/models/" +
        model +
        ":generateContent";

      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
        }),
      });

      if (!resp.ok) {
        laatsteFout = model + " → HTTP " + resp.status;
        continue; // volgend model proberen
      }

      const data = await resp.json();
      const parts =
        (data.candidates &&
          data.candidates[0] &&
          data.candidates[0].content &&
          data.candidates[0].content.parts) || [];

      for (const part of parts) {
        const inline = part.inlineData || part.inline_data;
        if (inline && inline.data) {
          res.status(200).json({
            image: inline.data, // base64
            mimeType: inline.mimeType || inline.mime_type || "image/png",
            model: model,
          });
          return;
        }
      }

      laatsteFout = model + " → geen plaatje in antwoord";
    } catch (e) {
      laatsteFout = model + " → " + (e && e.message ? e.message : String(e));
    }
  }

  res.status(502).json({
    error: "De tovermachine kon dit plaatje even niet maken. Probeer een andere wens!",
    detail: laatsteFout,
  });
}
