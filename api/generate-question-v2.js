function normalizeText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function stripGarbage(text) {
  const lines = String(text || "")
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean);

  const cleaned = lines.filter(line => {
    const lower = line.toLowerCase();

    if (line.length < 20) return false;
    if (line.includes("____")) return false;
    if (/^[A-Z\s]{8,}$/.test(line)) return false;

    if (lower.includes("grade") && lower.includes("section")) return false;
    if (lower.includes("learning activity")) return false;
    if (lower.includes("activity sheet")) return false;
    if (lower.includes("subject:")) return false;
    if (lower.includes("date:")) return false;
    if (lower.includes("quarter")) return false;
    if (lower.includes("name:")) return false;
    if (lower.includes("reference(s)")) return false;
    if (lower.includes("author(s)")) return false;
    if (lower.includes("rex book store")) return false;
    if (lower.includes("sampaloc manila")) return false;

    return true;
  });

  return normalizeText(cleaned.join("\n")).slice(0, 6000);
}

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

async function callLLM({ text, difficulty, type }) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const prompt = `
You are making a multiple-choice reviewer from study material.

Task:
1. Understand the study material context.
2. Create exactly 1 question.
3. Create exactly 3 answer choices total.
4. Only 1 choice must be correct.
5. The other 2 choices must be plausible but incorrect.
6. The wrong choices should be close to the topic, slightly twisted, partially true, or subtly inaccurate.
7. Avoid random copied metadata, titles, addresses, author names, forms, worksheet labels, and bibliography text.
8. Focus on meaningful academic content only.
9. Keep the answer choices concise but clear.
10. Return valid JSON only.

Difficulty: ${difficulty}
Question type: ${type}

Return JSON in exactly this shape:
{
  "question": "string",
  "correct_answer": "string",
  "choices": ["string", "string", "string"],
  "answer_idea": "string",
  "source_snippet": "string",
  "topic": "string"
}

Rules:
- "choices" must include the exact correct_answer plus 2 wrong answers.
- Make the wrong answers believable.
- Do not make joke answers.
- Do not copy irrelevant worksheet text.
- source_snippet should be a short supporting excerpt or paraphrased basis from the material.
- topic should be short.
`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.8,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You generate high-quality multiple-choice study questions from study notes."
        },
        {
          role: "user",
          content: `${prompt}\n\nStudy material:\n${text}`
        }
      ]
    })
  });

  const raw = await response.text();

  if (!response.ok) {
    throw new Error(`LLM error: ${raw}`);
  }

  const data = JSON.parse(raw);
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("No LLM content returned.");
  }

  return JSON.parse(content);
}

function validateOutput(output) {
  if (!output || typeof output !== "object") {
    throw new Error("Invalid AI output.");
  }

  if (!output.question || !output.correct_answer || !Array.isArray(output.choices)) {
    throw new Error("Missing required AI output fields.");
  }

  let choices = output.choices
    .map(choice => normalizeText(choice))
    .filter(Boolean);

  const correct = normalizeText(output.correct_answer);

  if (!choices.includes(correct)) {
    choices.push(correct);
  }

  choices = [...new Set(choices)];

  if (choices.length < 3) {
    throw new Error("Not enough answer choices returned.");
  }

  choices = choices.slice(0, 3);

  if (!choices.includes(correct)) {
    choices[0] = correct;
  }

  return {
    question: normalizeText(output.question),
    correct_answer: correct,
    choices: shuffle(choices),
    answer_idea: normalizeText(output.answer_idea || correct),
    source_snippet: normalizeText(output.source_snippet || correct),
    topic: normalizeText(output.topic || "General")
  };
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://lanceehux.github.io");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      text,
      difficulty = "medium",
      type = "definition",
      choiceCount = 3
    } = req.body || {};

    if (!text || !String(text).trim()) {
      return res.status(400).json({ error: "Text is required." });
    }

    if (Number(choiceCount) !== 3) {
      return res.status(400).json({
        error: "This endpoint currently supports exactly 3 choices."
      });
    }

    const cleanedText = stripGarbage(text);

    if (!cleanedText || cleanedText.length < 80) {
      return res.status(400).json({
        error: "Not enough clean study text to generate a question."
      });
    }

    const aiOutput = await callLLM({
      text: cleanedText,
      difficulty,
      type
    });

    const finalOutput = validateOutput(aiOutput);

    return res.status(200).json(finalOutput);
  } catch (error) {
    console.error("generate-question-v2 error:", error);
    return res.status(500).json({
      error: error.message || "Failed to generate question."
    });
  }
};
