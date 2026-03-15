function normalizeText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function stripGarbage(text) {
  const lines = String(text || "")
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean);

  const filtered = lines.filter(line => {
    const lower = line.toLowerCase();

    if (line.length < 15) return false;
    if (line.includes("____")) return false;

    if (lower.includes("grade") && lower.includes("section")) return false;
    if (lower.includes("learning activity sheet")) return false;
    if (lower.includes("activity sheet")) return false;
    if (lower.includes("subject:")) return false;
    if (lower.includes("date:")) return false;
    if (lower.includes("quarter")) return false;
    if (lower.includes("name:")) return false;
    if (lower.includes("reference(s)")) return false;
    if (lower.includes("author(s)")) return false;
    if (lower.includes("rex book store")) return false;
    if (lower.includes("sampaloc manila")) return false;
    if (lower.includes("please check the box")) return false;
    if (lower.includes("expert teacher")) return false;

    return true;
  });

  const cleaned = normalizeText(filtered.join(" "));

  // fallback if filtering removes too much
  if (cleaned.length < 200) {
    return normalizeText(text);
  }

  return cleaned.slice(0, 12000);
}

function splitIntoChunks(text, size = 700) {
  const sentences = String(text || "")
    .split(/(?<=[.?!])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 20);

  const chunks = [];
  let current = "";

  for (const sentence of sentences) {
    const next = current ? `${current} ${sentence}` : sentence;

    if (next.length > size) {
      if (current.trim()) chunks.push(current.trim());
      current = sentence;
    } else {
      current = next;
    }
  }

  if (current.trim()) chunks.push(current.trim());

  if (!chunks.length && text.trim()) {
    return [text.slice(0, size)];
  }

  return chunks;
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickTwoRandomChunks(chunks) {
  if (chunks.length === 0) return "";
  if (chunks.length === 1) return chunks[0];

  const firstIndex = Math.floor(Math.random() * chunks.length);
  let secondIndex = Math.floor(Math.random() * chunks.length);

  while (secondIndex === firstIndex && chunks.length > 1) {
    secondIndex = Math.floor(Math.random() * chunks.length);
  }

  return `${chunks[firstIndex]}\n\n${chunks[secondIndex]}`;
}

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function extractJSONObject(content) {
  const text = String(content || "").trim();

  try {
    return JSON.parse(text);
  } catch {}

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("Could not find valid JSON in model response.");
  }

  return JSON.parse(match[0]);
}

async function callGroq(excerpt, difficulty, type) {
  const apiKey = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

  if (!apiKey) {
    throw new Error("Missing GROQ_API_KEY");
  }

  const prompt = `
You are creating a multiple-choice reviewer from study material.

Use ONLY the provided study excerpt below.
Do not invent content outside the excerpt.

Your job:
1. Understand the excerpt.
2. Create exactly 1 question.
3. Create exactly 3 answer choices total.
4. Only 1 choice must be correct.
5. The other 2 choices must be believable but incorrect.
6. The wrong choices should stay close to the topic, but be subtly wrong, incomplete, twisted, or slightly misleading.
7. Ignore irrelevant worksheet text, headers, forms, addresses, author names, bibliography entries, and publisher details.
8. Focus only on meaningful lesson content.
9. Keep choices clear and readable.
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
- "choices" must contain the exact correct_answer plus 2 wrong answers.
- Wrong answers must be plausible, not random garbage.
- Do not use joke answers.
- source_snippet should be a short supporting excerpt or paraphrased idea from the study excerpt.
- topic should be short and meaningful.
`;

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 1,
      messages: [
        {
          role: "system",
          content:
            "You generate high-quality multiple-choice study questions from study notes and always return valid JSON."
        },
        {
          role: "user",
          content: `${prompt}\n\nStudy excerpt:\n${excerpt}`
        }
      ]
    })
  });

  const raw = await response.text();

  if (!response.ok) {
    throw new Error(`Groq error: ${raw}`);
  }

  const data = JSON.parse(raw);
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("No Groq content returned.");
  }

  return extractJSONObject(content);
}

function validateOutput(output) {
  if (!output || typeof output !== "object") {
    throw new Error("Invalid AI output.");
  }

  if (!output.question || !output.correct_answer || !Array.isArray(output.choices)) {
    throw new Error("Missing required AI output fields.");
  }

  const correct = normalizeText(output.correct_answer);

  let choices = output.choices
    .map(choice => normalizeText(choice))
    .filter(Boolean);

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

    const cleaned = stripGarbage(text);

    if (!cleaned || cleaned.length < 80) {
      return res.status(400).json({
        error: "Not enough usable text to generate a question."
      });
    }

    const chunks = splitIntoChunks(cleaned, 700);

    if (!chunks.length) {
      return res.status(400).json({
        error: "Could not create usable text chunks."
      });
    }

    const randomExcerpt = pickTwoRandomChunks(chunks);

    const aiOutput = await callGroq(randomExcerpt, difficulty, type);
    const finalOutput = validateOutput(aiOutput);

    return res.status(200).json(finalOutput);
  } catch (error) {
    console.error("generate-question-v2 error:", error);
    return res.status(500).json({
      error: error.message || "Failed to generate question."
    });
  }
};
