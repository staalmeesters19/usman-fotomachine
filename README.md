# Usman's Foto-Tovermachine 🍌

Een simpel, kindvriendelijk webpaginaatje waar je typt wat je wilt zien en er een plaatje
verschijnt. Aangedreven door Google's **Nano Banana** (Gemini image-model).

Gemaakt als cadeautje voor Usman (10 jaar) door oom Abdul.

## Hoe het werkt

```
Browser ──▶ /api/generate (Vercel serverless)
                 ├─ leest GEMINI_API_KEY uit de Vercel-omgeving (nooit in de browser)
                 └─ roept Nano Banana / Gemini aan → stuurt base64-plaatje terug
```

- `index.html` — de hele voorkant (vanilla HTML/JS, geen build-stap).
- `api/generate.js` — de proxy die de key verbergt en het beeldmodel aanroept.
- `vercel.json` — zet de functie-timeout op 60s (image-generatie mag even duren).

## Zelf draaien / deployen

1. Push deze repo naar GitHub.
2. Importeer 'm op [vercel.com](https://vercel.com) (of `vercel` via de CLI).
3. Zet in Vercel → Project → **Settings → Environment Variables** één variabele:
   - **Naam:** `GEMINI_API_KEY`
   - **Waarde:** je Google AI Studio key (aanmaken op https://aistudio.google.com)
4. Deploy. De live `*.vercel.app`-link kun je delen.

> De key staat **alleen** in Vercel, nooit in deze code of in de browser. Wil je het
> uitzetten? Pauzeer/verwijder het project in Vercel of haal de env var weg.

## Kosten

Elk plaatje kost een paar cent via de Gemini API. Zet voor de zekerheid een
budget-/quota-limiet op je key in Google AI Studio / Google Cloud.
