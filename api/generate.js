// Vercel serverless functie — proxy naar Google "Nano Banana" (Gemini image).
// De API-key staat ALLEEN in de Vercel env var GEMINI_API_KEY, nooit in de browser.
// Patroon (model-fallbacklijst) overgenomen uit de bestaande, werkende
// linkedin-automation/pipeline/agents/book_cover_agent.py.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

export const config = { maxDuration: 60 };

// Op volgorde geprobeerd tot er één een plaatje teruggeeft.
// Goedkoop (Flash) eerst; de duurdere Pro alleen als terugval.
const MODELS = [
  "gemini-2.5-flash-image",
  "gemini-2.5-flash-image-preview",
  "gemini-2.5-flash-preview-05-20",
  "nano-banana-pro-preview",
  "gemini-2.0-flash-exp",
];

// Kostenrem: max plaatjes per dag (instelbaar via env var, standaard 50 ≈ €1,75/dag bij Flash).
const MAX_PER_DAG = Number(String(process.env.MAX_PER_DAG || "").replace(/[^0-9]/g, "")) || 50;
const TELLER_PAD = join(tmpdir(), "tovermachine-teller.json");

// Houd het kindvriendelijk en veilig, ongeacht wat Usman intypt.
const VEILIG_PREFIX =
  "Maak een vrolijk, kleurrijk plaatje in een vriendelijke cartoon- of illustratiestijl, " +
  "geschikt voor een kind van 10 jaar. Geen enge, gewelddadige, bloederige of ongepaste " +
  "beelden, geen tekst in het plaatje. Onderwerp: ";

// Strip een eventuele BOM (U+FEFF) en omringende whitespace. Env-vars die via een
// pipe gezet worden kunnen een onzichtbaar BOM-teken vooraan krijgen; dat sloopt de
// x-goog-api-key header (HTTP headers mogen alleen Latin-1 bevatten).
function schoneKey(raw) {
  let k = raw || "";
  if (k.charCodeAt(0) === 0xfeff) k = k.slice(1); // leidende BOM
  return k.trim();
}

// --- Dagteller (kostenrem) ------------------------------------------------
// Best-effort: bewaard in /tmp van de serverless-instance + een module-cache.
// Reset automatisch bij een nieuwe dag (tijdzone Amsterdam).
let cache = null; // { date, count }

function vandaagNL() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(new Date());
}

function leesTeller() {
  const dag = vandaagNL();
  if (cache && cache.date === dag) return cache;
  try {
    const data = JSON.parse(readFileSync(TELLER_PAD, "utf8"));
    if (data && data.date === dag && typeof data.count === "number") {
      cache = data;
      return cache;
    }
  } catch {
    /* geen bestand, of van een vorige dag → opnieuw beginnen */
  }
  cache = { date: dag, count: 0 };
  return cache;
}

function verhoogTeller() {
  const t = leesTeller();
  t.count += 1;
  cache = t;
  try {
    writeFileSync(TELLER_PAD, JSON.stringify(t));
  } catch {
    /* best-effort; module-cache houdt het anders bij */
  }
  return t;
}
// --------------------------------------------------------------------------

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Gebruik POST." });
    return;
  }

  const apiKey = schoneKey(process.env.GEMINI_API_KEY);
  if (!apiKey) {
    res.status(500).json({
      error: "De tovermachine is nog niet ingesteld (GEMINI_API_KEY ontbreekt in Vercel).",
    });
    return;
  }

  // Kostenrem: niet meer dan MAX_PER_DAG plaatjes per dag.
  const teller = leesTeller();
  if (teller.count >= MAX_PER_DAG) {
    res.status(429).json({
      error:
        "De tovermachine heeft vandaag al " +
        MAX_PER_DAG +
        " plaatjes gemaakt en gaat nu even slapen. 🍌 Kom morgen terug voor meer!",
      limietBereikt: true,
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
        const tekst = await resp.text().catch(() => "");
        laatsteFout = model + " → HTTP " + resp.status + " " + tekst.slice(0, 200);
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
          const t = verhoogTeller(); // alleen tellen bij een gelukt plaatje
          res.status(200).json({
            image: inline.data, // base64
            mimeType: inline.mimeType || inline.mime_type || "image/png",
            model: model,
            vandaag: t.count,
            maxPerDag: MAX_PER_DAG,
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
