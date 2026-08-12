// api/develop.js
// AyAI Development Core
// Vercel Serverless Function
//
// Required Environment Variables:
// GROQ_API_KEY
// GITHUB_TOKEN
// GITHUB_OWNER
// GITHUB_REPO

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

const MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

// حدود صغيرة حتى لا نصطدم بـ TPM
const MAX_INPUT_CHARS = 12000;
const MAX_OUTPUT_TOKENS = 2800;

const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

function cleanText(value, max = MAX_INPUT_CHARS) {
  if (value === undefined || value === null) return "";

  return String(value)
    .replace(/\u0000/g, "")
    .slice(0, max);
}

function jsonResponse(res, status, data) {
  res.status(status).json(data);
}

function extractJSON(text) {
  if (!text) return null;

  let cleaned = text.trim();

  // إزالة markdown fences
  cleaned = cleaned
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  // المحاولة الأولى
  try {
    return JSON.parse(cleaned);
  } catch {}

  // البحث عن أول { وآخر }
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");

  if (first !== -1 && last !== -1 && last > first) {
    try {
      return JSON.parse(cleaned.slice(first, last + 1));
    } catch {}
  }

  return null;
}

function normalizeDevelopment(result) {
  if (!result || typeof result !== "object") {
    return {
      summary: "لم يتم الحصول على نتيجة تطوير صالحة.",
      changes: [],
      risk: "متوسط",
      apply: false
    };
  }

  const changes = Array.isArray(result.changes)
    ? result.changes
        .slice(0, 8)
        .map((item) => ({
          file: cleanText(item?.file, 120),
          type: cleanText(item?.type, 40),
          description: cleanText(item?.description, 500),
          action: cleanText(item?.action, 1000)
        }))
        .filter((x) => x.file)
    : [];

  return {
    summary: cleanText(result.summary, 1000),
    changes,
    risk: cleanText(result.risk || "منخفض", 100),
    apply: result.apply === true
  };
}

async function callGroq(messages, attempt = 0) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is missing");
  }

  const response = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.15,
      max_tokens: MAX_OUTPUT_TOKENS,
      response_format: {
        type: "json_object"
      }
    })
  });

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    data = {
      error: text
    };
  }

  // Rate limit
  if (response.status === 429) {
    if (attempt >= 2) {
      throw new Error(
        "Groq rate limit reached. Please wait about 60 seconds and try again."
      );
    }

    let wait = 45000;

    const retryAfter =
      response.headers.get("retry-after") ||
      response.headers.get("x-ratelimit-reset-tokens");

    if (retryAfter) {
      const parsed = Number(retryAfter);

      if (Number.isFinite(parsed)) {
        wait = Math.min(Math.max(parsed * 1000, 5000), 60000);
      }
    }

    await sleep(wait);

    return callGroq(messages, attempt + 1);
  }

  if (!response.ok) {
    const message =
      data?.error?.message ||
      data?.error ||
      `Groq API error ${response.status}`;

    throw new Error(message);
  }

  const content =
    data?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("Groq returned an empty response");
  }

  return content;
}

function buildSystemPrompt() {
  return `
You are AyAI Development Core.

Your job is to ANALYZE requested software improvements.

IMPORTANT RULES:

1. Do NOT rewrite entire files.
2. Do NOT return huge HTML/CSS/JS files.
3. Return ONLY a compact JSON object.
4. Maximum 8 proposed changes.
5. Each change must be small and precise.
6. Never claim a change was applied unless the server actually applied it.
7. Never invent filenames.
8. Prefer editing existing functionality instead of replacing it.
9. Protect existing features.
10. If the request is dangerous or unclear, set apply=false.
11. The user must approve changes before applying them.

Return exactly this JSON structure:

{
  "summary": "short Arabic summary",
  "changes": [
    {
      "file": "index.html",
      "type": "UI",
      "description": "short description",
      "action": "short implementation instruction"
    }
  ],
  "risk": "منخفض",
  "apply": false
}

The "action" must be an instruction, NOT the complete file.

Never return markdown.
Never return code fences.
`;
}

function buildUserPrompt(body) {
  const request = cleanText(
    body.request ||
    body.prompt ||
    body.message ||
    "",
    3000
  );

  const files = Array.isArray(body.files)
    ? body.files.slice(0, 5)
    : [];

  const compactFiles = files.map((file) => ({
    name: cleanText(file?.name, 120),
    content: cleanText(file?.content, 1500)
  }));

  return `
Development request:

${request}

Current project files:

${JSON.stringify(compactFiles)}

Analyze the request and propose the smallest safe changes.

Do not rewrite the complete files.
`;
}

async function analyzeDevelopment(req, res) {
  if (req.method !== "POST") {
    return jsonResponse(res, 405, {
      ok: false,
      error: "Method not allowed"
    });
  }

  try {
    const body =
      typeof req.body === "object" && req.body
        ? req.body
        : {};

    const prompt = buildUserPrompt(body);

    if (!body.request && !body.prompt && !body.message) {
      return jsonResponse(res, 400, {
        ok: false,
        error: "Development request is missing"
      });
    }

    const content = await callGroq([
      {
        role: "system",
        content: buildSystemPrompt()
      },
      {
        role: "user",
        content: prompt
      }
    ]);

    const parsed = extractJSON(content);

    if (!parsed) {
      return jsonResponse(res, 502, {
        ok: false,
        error: "Invalid development response from AI"
      });
    }

    const result = normalizeDevelopment(parsed);

    return jsonResponse(res, 200, {
      ok: true,
      action: "analyze",
      model: MODEL,
      result
    });

  } catch (error) {
    console.error("Development Core error:", error);

    return jsonResponse(res, 500, {
      ok: false,
      error: error.message || "Development Core failed"
    });
  }
}


// ---------------------------------------------------------
// GITHUB
// ---------------------------------------------------------

async function githubRequest(path, options = {}) {
  if (!process.env.GITHUB_TOKEN) {
    throw new Error("GITHUB_TOKEN is missing");
  }

  const response = await fetch(
    `https://api.github.com${path}`,
    {
      ...options,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    }
  );

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    data = {
      message: text
    };
  }

  if (!response.ok) {
    throw new Error(
      data?.message ||
      `GitHub API error ${response.status}`
    );
  }

  return data;
}

async function getGithubFile(filePath) {
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;

  if (!owner || !repo) {
    throw new Error(
      "GITHUB_OWNER or GITHUB_REPO is missing"
    );
  }

  const data = await githubRequest(
    `/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}`
  );

  if (!data.content) {
    throw new Error(
      `GitHub file content not available: ${filePath}`
    );
  }

  const content = Buffer.from(
    data.content.replace(/\n/g, ""),
    "base64"
  ).toString("utf8");

  return {
    content,
    sha: data.sha
  };
}

async function updateGithubFile(
  filePath,
  newContent,
  sha,
  message
) {
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;

  const encoded = Buffer.from(
    newContent,
    "utf8"
  ).toString("base64");

  return githubRequest(
    `/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}`,
    {
      method: "PUT",
      body: JSON.stringify({
        message:
          message ||
          "AyAI Development Core update",
        content: encoded,
        sha
      })
    }
  );
}


// ---------------------------------------------------------
// APPLY
// ---------------------------------------------------------

async function applyDevelopment(req, res) {
  if (req.method !== "POST") {
    return jsonResponse(res, 405, {
      ok: false,
      error: "Method not allowed"
    });
  }

  try {
    const body =
      typeof req.body === "object" && req.body
        ? req.body
        : {};

    if (body.approved !== true) {
      return jsonResponse(res, 403, {
        ok: false,
        error: "APPROVAL_REQUIRED"
      });
    }

    const file = cleanText(body.file, 150);

    const content =
      typeof body.content === "string"
        ? body.content
        : null;

    if (!file || !content) {
      return jsonResponse(res, 400, {
        ok: false,
        error:
          "file and content are required for APPLY"
      });
    }

    // حماية من تعديل ملفات غير مسموحة
    const allowedFiles = [
      "index.html",
      "styles.css",
      "script.js",
      "layout.json"
    ];

    if (!allowedFiles.includes(file)) {
      return jsonResponse(res, 403, {
        ok: false,
        error: "FILE_NOT_ALLOWED"
      });
    }

    const githubFile =
      await getGithubFile(file);

    const result =
      await updateGithubFile(
        file,
        content,
        githubFile.sha,
        body.commitMessage ||
          `AyAI: update ${file}`
      );

    return jsonResponse(res, 200, {
      ok: true,
      action: "apply",
      message: "Change applied successfully",
      file,
      commit: result?.commit?.sha || null
    });

  } catch (error) {
    console.error("GitHub apply error:", error);

    return jsonResponse(res, 500, {
      ok: false,
      error: error.message ||
        "GitHub apply failed"
    });
  }
}


// ---------------------------------------------------------
// MAIN ROUTER
// ---------------------------------------------------------

export default async function handler(req, res) {
  try {
    const body =
      typeof req.body === "object" && req.body
        ? req.body
        : {};

    const action =
      body.action ||
      "analyze";

    switch (action) {

      case "analyze":
      case "develop":
      case "development":
        return analyzeDevelopment(req, res);

      case "apply":
        return applyDevelopment(req, res);

      default:
        return jsonResponse(res, 400, {
          ok: false,
          error: "Unknown development action",
          allowedActions: [
            "analyze",
            "develop",
            "development",
            "apply"
          ]
        });
    }

  } catch (error) {
    console.error(error);

    return jsonResponse(res, 500, {
      ok: false,
      error:
        error.message ||
        "Development Core failed"
    });
  }
}
