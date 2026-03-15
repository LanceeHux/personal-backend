export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { text } = req.body || {};

    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "Missing text." });
    }

    const cleaned = text.replace(/\s+/g, " ").trim();

    if (cleaned.length < 200) {
      return res.status(400).json({ error: "Not enough text to generate a question." });
    }

    const limitedText = cleaned.slice(0, 12000);

    const prompt = `
You are a quiz generator.

Based only on the study material below, create exactly ONE multiple-choice question.

Rules:
- The question must be answerable from the provided text.
- Create exactly 3 answer choices.
- Only 1 choice must be correct.
- The 2 wrong choices should be believable but clearly incorrect based on the text.
- Avoid vague wording.
- Return valid JSON only.
- Do not wrap in markdown.
- Use this exact shape:

{
  "question": "string",
  "choices": ["choice 1", "choice 2", "choice 3"],
  "correctAnswer": "one of the choices exactly",
  "explanation": "short explanation"
}

Study material:
"""${limitedText}"""
`;

    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        temperature: 0.7,
        messages: [
          {
            role: "system",
            content: "You generate educational quiz questions and must always return valid JSON only."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" }
      })
    });

    const groqData = await groqResponse.json();

    if (!groqResponse.ok) {
      console.error("Groq API error:", groqData);
      return res.status(500).json({
        error: groqData?.error?.message || "Groq request failed."
      });
    }

    const raw = groqData?.choices?.[0]?.message?.content;

    if (!raw) {
      return res.status(500).json({ error: "No response from AI." });
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return res.status(500).json({ error: "AI returned invalid JSON." });
    }

    if (
      !parsed.question ||
      !Array.isArray(parsed.choices) ||
      parsed.choices.length !== 3 ||
      !parsed.correctAnswer
    ) {
      return res.status(500).json({ error: "AI returned incomplete quiz data." });
    }

    return res.status(200).json(parsed);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal server error." });
  }
}
