function splitIntoSentences(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .split(/(?<=[.?!])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 30);
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

function makeQuestion(sentence, type = "definition") {
  const cleaned = sentence.replace(/\s+/g, " ").trim();

  if (type === "comparison") {
    return `Which choice best matches this idea from the reviewer?`;
  }

  if (type === "application") {
    return `Which statement is the best application of this concept?`;
  }

  if (type === "concept") {
    return `Which choice best explains this concept?`;
  }

  return `Which choice best defines the idea described in the reviewer?`;
}

function makeWrongChoices(correctAnswer, sourceText) {
  const sentences = splitIntoSentences(sourceText).filter(
    s => s !== correctAnswer && s.length > 20
  );

  const wrongs = [];

  for (const s of sentences) {
    if (
      s.toLowerCase() !== correctAnswer.toLowerCase() &&
      !wrongs.includes(s)
    ) {
      wrongs.push(s);
    }
    if (wrongs.length === 2) break;
  }

  while (wrongs.length < 2) {
    wrongs.push(`This choice is incorrect because it does not match the main idea.`);
  }

  return wrongs.slice(0, 2);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { text, difficulty = "medium", type = "definition" } = req.body || {};

    if (!text || !String(text).trim()) {
      return res.status(400).json({ error: "Text is required." });
    }

    const sourceText = String(text).trim().slice(0, 5000);
    const sentences = splitIntoSentences(sourceText);

    if (sentences.length === 0) {
      return res.status(400).json({ error: "Not enough usable text to generate a question." });
    }

    let selectedSentence = pickRandom(sentences);

    if (difficulty === "easy") {
      selectedSentence = sentences[0] || selectedSentence;
    } else if (difficulty === "hard") {
      selectedSentence = sentences[sentences.length - 1] || selectedSentence;
    }

    const correctAnswer = selectedSentence;
    const wrongChoices = makeWrongChoices(correctAnswer, sourceText);
    const choices = shuffle([correctAnswer, ...wrongChoices]);

    const topic =
      correctAnswer.split(" ").slice(0, 5).join(" ") || "General";

    return res.status(200).json({
      question: makeQuestion(correctAnswer, type),
      choices,
      correct_answer: correctAnswer,
      answer_idea: correctAnswer,
      source_snippet: correctAnswer,
      topic
    });
  } catch (error) {
    console.error("generate-question error:", error);
    return res.status(500).json({
      error: "Failed to generate question."
    });
  }
};
