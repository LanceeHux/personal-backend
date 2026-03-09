export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  try {
    const body = req.body || {};
    const notes = String(body.notes || "").trim();
    const count = Math.max(1, Math.min(20, Number(body.count || 10)));

    if (!notes) {
      return res.status(400).json({ error: "Missing notes" });
    }

    const prompt = `
Convert the study notes below into exactly ${count} flashcards.

Rules:
- Return ONLY valid JSON.
- Do not wrap the JSON in markdown.
- Return an array.
- Each item must have:
  - "question"
  - "answer"
- Make the questions clear and natural, like a real reviewer.
- Keep answers concise but complete.
- Avoid duplicate cards.
- If the notes are short, make fewer high-quality cards instead of forcing bad ones.

Example format:
[
  {
    "question": "What is phenomenology?",
    "answer": "A qualitative research approach that studies lived experiences."
  }
]

Study notes:
${notes}
`.trim();

    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        temperature: 0.4,
        max_tokens: 900,
        messages: [
          {
            role: "system",
            content: "You create clean educational flashcards and return only valid JSON."
          },
          {
            role: "user",
            content: prompt
          }
        ]
      }),
    });

    const data = await r.json().catch(() => ({}));

    if (!r.ok) {
      return res.status(r.status).json({
        error: data?.error?.message || "Groq API error",
        raw: data
      });
    }

    const text = (data?.choices?.[0]?.message?.content || "").trim();

    let cards;
    try {
      cards = JSON.parse(text);
    } catch {
      const fixed = text
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/, "")
        .trim();

      try {
        cards = JSON.parse(fixed);
      } catch {
        return res.status(200).json({
          cards: [],
          error: "AI returned invalid JSON",
          raw: text
        });
      }
    }

    if (!Array.isArray(cards)) {
      return res.status(200).json({
        cards: [],
        error: "AI did not return an array"
      });
    }

    const cleanCards = cards
      .map((c) => ({
        question: String(c?.question || "").trim(),
        answer: String(c?.answer || "").trim()
      }))
      .filter((c) => c.question && c.answer)
      .slice(0, count);

    return res.status(200).json({ cards: cleanCards });
  } catch (err) {
    return res.status(500).json({
      error: err?.message || "Server error",
      cards: []
    });
  }
}
