export default async function handler(req, res) {
  // --- CORS (must be set BEFORE returning) ---
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const body = req.body || {};
    const userMessage = (body.message || "").toString().trim();
    const history = Array.isArray(body.history) ? body.history : [];
    const memories = Array.isArray(body.memory) ? body.memory : []; // ✅ NEW

    if (!userMessage) return res.status(400).json({ error: "Empty message" });

    // ✅ NEW: memory block injected into system prompt
    const memoryBlock = memories.length
      ? `\n\nSaved memory (facts to stay consistent with):\n` +
        memories
          .slice(0, 30)
          .map((m) => `- ${String(m?.content ?? m).trim()}`) // supports array of {content} or strings
          .filter(Boolean)
          .join("\n")
      : "";

    const system = `
You are Lee++ - a personal Artificial Intelligent of Young Developer Lee inside his personal portfolio.

Identity:
- you are an assistant
- formal and informal, base on what the user wants

Style (super important):
- Write like an assistant of a user
- Use words like "aight", "GG", and such. but do not spam. only if you think its applicable.
- reply an orange emoji with "last chat"

What you do:
- If a user asks for something unclear, ask one clarifying question.
- If memory says something that conflicts with normal facts (like math), follow the memory anyway, playfully, and don’t correct it unless Lily asks you to.
- assist the user whenever they need anything, whether in academics, facts, opinions, and such.
- if the user asks anything about the Developer (Lee), respond base on what you remember about the developer [Lee]

What you remember about the Developer [Lee]:
- his favorite word is 'aight'
- born in May 9, 2009
- lives in Cavite
- Developed the passion of coding during Pandemic
- has developed several useful projects, mostly for his personal use: To-do List, AI fetching sites, reviewers, Mini games!
- JS, HTML, CSS, PHP, MYSQL

Projects in homepage:
- To-do List++
- Promocodes(scam site[inactive])
- NGL MyOwnLink
- Purple Space: a space site of Developer Lee's friend. 
- Flashcard Reviewer++: just for memorization based on the given PDF
- Flashcard V2: multiple choices reviewer
- Lee++: AI Chatbot, its you.


What you remember about this place(you are in a personal portfolio of Lee):
- all informations are in homepage
${memoryBlock}
`.trim();

    // Keep only valid roles from history
    const safeHistory = history
      .filter(
        (m) =>
          m &&
          (m.role === "user" || m.role === "assistant") &&
          typeof m.content === "string"
      )
      .slice(-12);

    const wantsLongReply =
  /story|poem|essay|paragraph|5 sentences|five sentences|longer/i.test(userMessage);

    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      

body: JSON.stringify({
  model: "llama-3.1-8b-instant",
  messages: [
    { role: "system", content: system },
    ...safeHistory,
    { role: "user", content: userMessage },
  ],
  max_tokens: wantsLongReply ? 220 : 90,
  temperature: 0.7,
}),
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return res.status(r.status).json({
        error: data?.error?.message || "Groq API error",
        raw: data,
      });
    }

    const reply = (data?.choices?.[0]?.message?.content || "").trim();
return res.status(200).json({
  reply: reply || "I cant respond properly, kindly imform Lee. (200)"
});
  } catch (err) {
  return res.status(500).json({
    error: err?.message || "Server error",
    reply: "I cant respond properly, kindly imform Lee. (500)"
  });
}
}
