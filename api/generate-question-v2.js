function normalizeText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function splitIntoSentences(text) {
  return normalizeText(text)
    .split(/(?<=[.?!])\s+/)
    .map(s => s.trim())
    .filter(s => {
      if (s.length < 30) return false;

      const lower = s.toLowerCase();

      if (lower.includes("grade") && lower.includes("section")) return false;
      if (lower.includes("learning activity")) return false;
      if (lower.includes("activity sheet")) return false;
      if (lower.includes("please check the box")) return false;
      if (lower.includes("date:")) return false;
      if (lower.includes("subject:")) return false;
      if (lower.includes("quarter")) return false;
      if (lower.includes("expert teacher")) return false;
      if (lower.includes("name:")) return false;

      if (s.includes("____")) return false;
      if (/^[A-Z\s]{10,}$/.test(s)) return false;
      if (/^[A-Za-z\s]+:$/.test(s)) return false;

      return true;
    });
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
      return "Which option correctly explains the concept?";
    case "application":
      return "Which option best applies the idea described in the reviewer?";
    case "comparison":
      return "Which option correctly describes the comparison?";
    case "definition":
    default:
      return "Which statement correctly represents the idea from the reviewer?";
  }
}

function makeFallbackWrongs(correctAnswer, type) {
  const pools = {
    definition: [
      "A statement that sounds related but does not match the actual definition.",
      "An explanation of a different concept that is not the correct answer.",
      "A description that is too vague to correctly define the idea."
    ],
    concept: [
      "A related idea, but not the concept being explained.",
      "An incomplete explanation that misses the real meaning of the concept.",
      "A misleading explanation that sounds correct at first."
    ],
    application: [
      "An example that does not actually apply the concept correctly.",
      "A situation that is related to the topic but uses the idea the wrong way.",
      "A statement that describes the topic but not its application."
    ],
    comparison: [
      "A statement that mentions the topic but does not compare it correctly.",
      "A description that mixes up similarities and differences.",
      "An option that focuses on only one side instead of making a comparison."
    ]
  };

  return (pools[type] || pools.definition)
    .filter(item => item.toLowerCase() !== correctAnswer.toLowerCase())
    .slice(0, 2);
}

function buildWrongChoices(correctAnswer, sentences, type) {
  const normalizedCorrect = normalizeText(correctAnswer).toLowerCase();

  const candidates = sentences.filter(sentence => {
    const normalizedSentence = normalizeText(sentence).toLowerCase();

    if (normalizedSentence === normalizedCorrect) return false;
    if (normalizedSentence.length < 25) return false;
    if (normalizedCorrect.includes(normalizedSentence)) return false;
    if (normalizedSentence.includes(normalizedCorrect)) return false;

    return true;
  });

  const unique = [];
  for (const candidate of candidates) {
    const shortCandidate = shorten(candidate);
    if (!unique.some(item => item.toLowerCase() === shortCandidate.toLowerCase())) {
      unique.push(shortCandidate);
    }
    if (unique.length === 2) break;
  }

  if (unique.length < 2) {
    const fallback = makeFallbackWrongs(correctAnswer, type);
    for (const item of fallback) {
      if (unique.length < 2) unique.push(item);
    }
  }

  return unique.slice(0, 2);
}

function chooseSourceSentence(sentences, difficulty) {
  if (!sentences.length) return "";

  if (difficulty === "easy") {
    return sentences[0];
  }

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
        error: "Not enough clean text to generate a question."
      });
    }

    const sourceSentence = chooseSourceSentence(sentences, difficulty);
    const correctAnswer = shorten(sourceSentence);
    const wrongChoices = buildWrongChoices(correctAnswer, sentences, type);
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
