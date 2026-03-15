function normalizeText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function stripGarbage(text) {
  const lines = String(text || "")
    .split(/\n+/)
    .map(l => l.trim())
    .filter(Boolean);

  const filtered = lines.filter(line => {
    const lower = line.toLowerCase();

    if (line.length < 15) return false;
    if (line.includes("____")) return false;

    if (lower.includes("grade") && lower.includes("section")) return false;
    if (lower.includes("learning activity sheet")) return false;
    if (lower.includes("subject:")) return false;
    if (lower.includes("date:")) return false;

    return true;
  });

  const cleaned = normalizeText(filtered.join(" "));

  // fallback if filter removed too much
  if (cleaned.length < 200) {
    return normalizeText(text);
  }

  return cleaned;
}

function splitIntoChunks(text, size = 700) {
  const sentences = text
    .split(/(?<=[.?!])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 20);

  const chunks = [];
  let current = "";

  for (const s of sentences) {
    if ((current + " " + s).length > size) {
      chunks.push(current.trim());
      current = s;
    } else {
      current += " " + s;
    }
  }

  if (current.trim()) chunks.push(current.trim());

  return chunks.length ? chunks : [text.slice(0, size)];
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

async function callGroq(text, difficulty, type) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
      temperature: 1,
      messages: [
        {
          role: "system",
          content:
            "You generate study questions from notes and must return JSON."
        },
        {
          role: "user",
          content: `
Create a multiple-choice question from this study excerpt.

Difficulty: ${difficulty}
Question type: ${type}

Rules:
- Create exactly 3 answer choices
- Only one is correct
- The other two must be believable but wrong
- Stay within the context of the excerpt

Return JSON:

{
 "question": "",
 "correct_answer": "",
 "choices": ["", "", ""],
 "topic": "",
 "source_snippet": ""
}

Excerpt:
${text}
`
        }
      ]
    })
  });

  const raw = await response.text();

  if (!response.ok) {
    throw new Error(raw);
  }

  const data = JSON.parse(raw);
  const content = data.choices[0].message.content;

  const jsonMatch = content.match(/\{[\s\S]*\}/);

  if (!jsonMatch) throw new Error("AI returned invalid JSON");

  return JSON.parse(jsonMatch[0]);
}

function validate(output) {
  const correct = normalizeText(output.correct_answer);

  let choices = output.choices.map(c => normalizeText(c)).filter(Boolean);

  if (!choices.includes(correct)) choices.push(correct);

  choices = [...new Set(choices)].slice(0, 3);

  return {
    question: normalizeText(output.question),
    correct_answer: correct,
    choices: shuffle(choices),
    topic: normalizeText(output.topic || "General"),
    source_snippet: normalizeText(output.source_snippet || "")
  };
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const { text, difficulty = "medium", type = "definition" } = req.body;

    if (!text) {
      return res.status(400).json({ error: "Text required." });
    }

    const cleaned = stripGarbage(text);
    const chunks = splitIntoChunks(cleaned, 700);

    const randomChunk = pickRandom(chunks);

    const ai = await callGroq(randomChunk, difficulty, type);

    const result = validate(ai);

    res.status(200).json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
