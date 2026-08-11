export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const { message } = req.body || {};

    if (!message || !message.trim()) {
      return res.status(400).json({
        error: "Message is required"
      });
    }

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            {
              role: "system",
              content: `
أنت AyAI، مساعد شخصي ذكي للمستخدم.

تحدث باللغة العربية العراقية بشكل طبيعي وبسيط.
كن مختصراً وواضحاً.
إذا طلب المستخدم شرحاً مفصلاً، قدم التفاصيل المطلوبة.
لا تقل إنك نموذج ذكاء اصطناعي إلا إذا سُئلت مباشرة.
اسمك AyAI.
              `
            },
            {
              role: "user",
              content: message
            }
          ],
          temperature: 0.7,
          max_tokens: 500
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.error?.message || "Groq API error"
      });
    }

    const answer =
      data?.choices?.[0]?.message?.content ||
      "ما گدرت أطلع جواب حالياً.";

    return res.status(200).json({
      answer
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Internal server error"
    });
  }
}
