function normalizeText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function splitIntoSentences(text) {
  return normalizeText(text)
    .split(/(?<=[.?!])\s+/)
    .map(s => s.trim())
    .filter(s => s.length >= 30);
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

function shorten(text, max = 180) {
  const clean = normalizeText(text);
  if (clean.length <= max) return clean;
  return clean.slice(0, max).trim() + "...";
}

function buildQuestion(type) {
  switch (type) {
    case "concept":
      return "Which choice best explains the concept from the reviewer?";
    case "application":
      return "Which choice is the best application of the idea from the reviewer?";
    case "comparison":
      return "Which choice best matches the statement from the reviewer?";
    case "definition":
    default:
      return "Which choice best defines the idea from the reviewer?";
  }
}

function makeFallbackWrongs(correctAnswer) {
  return [
    "A statement that sounds related but does not match the main idea.",
    "A definition for a different concept than the one asked in the question."
  ].filter(w => w.toLowerCase() !== correctAnswer.toLowerCase());
}

function buildWrongChoices(correctAnswer, sentences) {
  const candidates = sentences.filter(sentence => {
    const normalizedSentence = normalizeText(sentence).toLowerCase();
    const normalizedCorrect = normalizeText(correctAnswer).toLowerCase();

    return (
      normalizedSentence !== normalizedCorrect &&
      normalizedSentence.length >= 25 &&
      !normalizedCorrect.includes(normalizedSentence) &&
      !normalizedSentence.includes(normalizedCorrect)
    );
  });

  const unique = [];
  for (const candidate of candidates) {
    if (!unique.some(item => item.toLowerCase() === candidate.toLowerCase())) {
      unique.push(shorten(candidate));
    }
    if (unique.length === 2) break;
  }

  if (unique.length < 2) {
    const fallback = makeFallbackWrongs(correctAnswer);
    for (const item of fallback) {
      if (unique.length < 2) unique.push(item);
    }
  }

  return unique.slice(0, 2);
}

function chooseSourceSentence(sentences, difficulty) {
  if (!sentences.length) return "";

  if (difficulty === "easy") return sentences[0];

  if (difficulty === "hard") {
    const longer = sentences.filter(s => s.length > 80);
    return longer.length ? pickRandom(longer) : sentences[sentences.length - 1];
  }

  return pickRandom(sentences);
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

    const sourceText = normalizeText(text).slice(0, 5000);

    if (!sourceText) {
      return res.status(400).json({ error: "Text is required." });
    }

    if (Number(choiceCount) !== 3) {
      return res.status(400).json({
        error: "This endpoint currently supports exactly 3 choices."
      });
    }

    const sentences = splitIntoSentences(sourceText);

    if (!sentences.length) {
      return res.status(400).json({
        error: "Not enough usable text to generate a question."
      });
    }

    const sourceSentence = chooseSourceSentence(sentences, difficulty);
    const correctAnswer = shorten(sourceSentence);
    const wrongChoices = buildWrongChoices(correctAnswer, sentences);
    const choices = shuffle([correctAnswer, ...wrongChoices]);

    return res.status(200).json({
      question: buildQuestion(type),
      choices,
      correct_answer: correctAnswer,
      answer_idea: correctAnswer,
      source_snippet: shorten(sourceSentence, 220),
      topic: correctAnswer.split(" ").slice(0, 6).join(" ")
    });
  } catch (error) {
    console.error("generate-question-v2 error:", error);
    return res.status(500).json({
      error: "Failed to generate question."
    });
  }
};
