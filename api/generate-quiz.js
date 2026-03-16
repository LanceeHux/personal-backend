export default async function handler(req, res) {
  const allowedOrigin = "https://personal-backend.github.io";

  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { text, previousQuestions = [] } = req.body || {};

    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "Missing text." });
    }

    const cleaned = text
      .replace(/\r/g, " ")
      .replace(/\n+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (cleaned.length < 500) {
      return res.status(400).json({ error: "Not enough clean study text to generate a question." });
    }

    function splitIntoChunks(str, chunkSize = 2200, overlap = 300) {
      const chunks = [];
      let start = 0;

      while (start < str.length) {
        const end = Math.min(start + chunkSize, str.length);
        const chunk = str.slice(start, end).trim();

        if (chunk.length > 400) {
          chunks.push(chunk);
        }

        if (end >= str.length) break;
        start += (chunkSize - overlap);
      }

      return chunks;
    }

    function shuffle(arr) {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }

    const chunks = splitIntoChunks(cleaned);

    if (!chunks.length) {
      return res.status(400).json({ error: "Could not build usable text chunks." });
    }

    const selectedChunk = shuffle(chunks).slice(0, 3).join("\n\n");

    const previousBlock = Array.isArray(previousQuestions) && previousQuestions.length
      ? previousQuestions.slice(-10).map((q, i) => `${i + 1}. ${q}`).join("\n")
      : "None";

    const prompt = `
You are an educational quiz generator.

Using ONLY the study material below, create exactly ONE multiple-choice question.

Strict rules:
- The question must be based on an important idea from the material.
- Avoid repeating the same topic or wording as previous questions.
- Focus on a RANDOM concept from the provided material.
- Do NOT keep asking about only one main topic if other concepts exist.
- Make exactly 3 answer choices.
- Exactly 1 choice must be correct.
- The 2 wrong choices must be believable but incorrect according to the material.
- Keep the wording clear and specific.
- Return valid JSON only.
- Do not wrap the JSON in markdown.

Return exactly in this shape:
{
  "question": "string",
  "choices": ["choice 1", "choice 2", "choice 3"],
  "correctAnswer": "one of the choices exactly",
  "explanation": "short explanation"
}

Previous questions to avoid repeating:
${previousBlock}

Study material:
"""${selectedChunk}"""
`;

    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        temperature: 1.0,
        top_p: 0.95,
        messages: [
          {
            role: "system",
            content: "You generate varied educational quiz questions and return valid JSON only."
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
    } catch (err) {
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

    const correctExists = parsed.choices.some(
      (c) => String(c).trim() === String(parsed.correctAnswer).trim()
    );

    if (!correctExists) {
      return res.status(500).json({ error: "Correct answer is not inside choices." });
    }

    return res.status(200).json({
      question: parsed.question,
      choices: parsed.choices,
      correctAnswer: parsed.correctAnswer,
      explanation: parsed.explanation || ""
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal server error." });
  }
}
