export default async function handler(req, res) {

  if (req.method !== "POST") {

    return res.status(405).json({
      error: "Only POST requests are allowed"
    });

  }


  try {

    const {
      message
    } = req.body || {};


    if (!message) {

      return res.status(400).json({
        error: "No message received"
      });

    }


    const apiKey =
      process.env.GROQ_API_KEY;


    if (!apiKey) {

      return res.status(500).json({
        error: "GROQ_API_KEY is missing"
      });

    }


    const systemPrompt = `

أنت AyAI.

أنت مساعد شخصي ذكي ومتطور.

تحدث بالعربية العراقية بشكل طبيعي عندما يناسب السياق.

يمكنك أيضاً استخدام العربية الفصحى إذا كان الموضوع تقنياً أو رسمياً.

قواعدك:

1. أجب مباشرة.
2. لا تكرر السؤال.
3. لا تدّعي أنك نفذت شيئاً لم تنفذه.
4. إذا احتجت أداة غير موجودة قل ذلك بوضوح.
5. ساعد المستخدم في البرمجة والهندسة والتصميم.
6. يمكنك تحليل الأكواد واقتراح تحسينات.
7. لا تعدل كود النظام تلقائياً.
8. أي تعديل على ملفات AyAI يجب أن يمر من DEVELOPMENT CORE وبموافقة المستخدم.
9. إذا طلب المستخدم تطوير AyAI، اشرح ما الذي يمكن تطويره واقترح خطة.
10. لا تكشف مفاتيح API أو أسرار البيئة.

أنت جزء من نظام AyAI
ولست نظام تشغيل كامل.

`;


    const groqResponse =
      await fetch(
        "https://api.groq.com/openai/v1/chat/completions",
        {

          method: "POST",

          headers: {

            "Content-Type":
              "application/json",

            "Authorization":
              `Bearer ${apiKey}`

          },

          body: JSON.stringify({

            model:
              "llama-3.3-70b-versatile",

            messages: [

              {
                role: "system",
                content: systemPrompt
              },

              {
                role: "user",
                content: message
              }

            ],

            temperature: 0.65,

            max_completion_tokens:
              2048

          })

        }
      );


    const result =
      await groqResponse.json();


    if (!groqResponse.ok) {

      return res.status(
        groqResponse.status
      ).json({

        error:
          result?.error?.message ||
          "Groq request failed"

      });

    }


    const answer =
      result
        ?.choices?.[0]
        ?.message?.content;


    if (!answer) {

      return res.status(500).json({

        error:
          "Groq returned no answer"

      });

    }


    return res.status(200).json({

      answer:
        answer.trim()

    });


  } catch (error) {

    console.error(
      "AyAI Chat Error:",
      error
    );


    return res.status(500).json({

      error:
        error.message ||
        "Server error"

    });

  }

}
