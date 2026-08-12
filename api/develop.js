// api/develop.js

import crypto from "crypto";

const GITHUB_API = "https://api.github.com";
const GITHUB_API_VERSION = "2026-03-10";

const OWNER = process.env.GITHUB_OWNER;
const REPO = process.env.GITHUB_REPO;
const BRANCH = process.env.GITHUB_BRANCH || "main";
const TOKEN = process.env.GITHUB_TOKEN;

const APPROVAL_SECRET =
  process.env.DEVELOPMENT_APPROVAL_SECRET;

const ALLOWED_FILES = [
  "index.html"
];


// =====================================================
// HELPERS
// =====================================================

function json(res, status, data) {
  return res.status(status).json(data);
}


function githubHeaders() {

  if (!TOKEN) {
    throw new Error(
      "GITHUB_TOKEN is not configured in Vercel."
    );
  }

  return {
    "Accept":
      "application/vnd.github+json",

    "Authorization":
      `Bearer ${TOKEN}`,

    "X-GitHub-Api-Version":
      GITHUB_API_VERSION,

    "Content-Type":
      "application/json"
  };
}


function validateConfig() {

  const missing = [];

  if (!OWNER)
    missing.push("GITHUB_OWNER");

  if (!REPO)
    missing.push("GITHUB_REPO");

  if (!TOKEN)
    missing.push("GITHUB_TOKEN");

  if (!APPROVAL_SECRET)
    missing.push(
      "DEVELOPMENT_APPROVAL_SECRET"
    );

  if (missing.length) {

    throw new Error(
      "Missing environment variables: " +
      missing.join(", ")
    );

  }

}


function base64Encode(text) {

  return Buffer
    .from(text, "utf8")
    .toString("base64");

}


function base64Decode(text) {

  return Buffer
    .from(
      text.replace(/\n/g, ""),
      "base64"
    )
    .toString("utf8");

}


function safePath(path) {

  if (!path)
    throw new Error("File path is required.");

  if (
    !ALLOWED_FILES.includes(path)
  ) {

    throw new Error(
      `File is not allowed: ${path}`
    );

  }

  return path;

}


function sha256(text) {

  return crypto
    .createHash("sha256")
    .update(text, "utf8")
    .digest("hex");

}


// =====================================================
// APPROVAL TOKEN
// =====================================================

function createApprovalToken(payload) {

  const encodedPayload =
    Buffer
      .from(
        JSON.stringify(payload),
        "utf8"
      )
      .toString("base64url");


  const signature =
    crypto
      .createHmac(
        "sha256",
        APPROVAL_SECRET
      )
      .update(encodedPayload)
      .digest("base64url");


  return (
    encodedPayload +
    "." +
    signature
  );

}


function verifyApprovalToken(token) {

  if (!token)
    throw new Error(
      "Approval token is missing."
    );


  const parts =
    token.split(".");


  if (parts.length !== 2) {

    throw new Error(
      "Invalid approval token."
    );

  }


  const [
    encodedPayload,
    signature
  ] = parts;


  const expected =
    crypto
      .createHmac(
        "sha256",
        APPROVAL_SECRET
      )
      .update(encodedPayload)
      .digest("base64url");


  if (
    !crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    )
  ) {

    throw new Error(
      "Invalid approval token signature."
    );

  }


  let payload;

  try {

    payload =
      JSON.parse(
        Buffer
          .from(
            encodedPayload,
            "base64url"
          )
          .toString("utf8")
      );

  } catch {

    throw new Error(
      "Invalid approval token payload."
    );

  }


  if (
    !payload.expiresAt ||
    Date.now() > payload.expiresAt
  ) {

    throw new Error(
      "Approval token has expired."
    );

  }


  return payload;

}


// =====================================================
// GITHUB — READ FILE
// =====================================================

async function getGithubFile(path) {

  safePath(path);

  const url =
    `${GITHUB_API}/repos/` +
    `${OWNER}/${REPO}/contents/` +
    `${encodeURIComponent(path)}` +
    `?ref=${encodeURIComponent(BRANCH)}`;


  const response =
    await fetch(
      url,
      {
        method: "GET",
        headers: githubHeaders()
      }
    );


  const data =
    await response.json();


  if (!response.ok) {

    throw new Error(
      data?.message ||
      `GitHub read failed (${response.status})`
    );

  }


  if (
    data.type !== "file"
  ) {

    throw new Error(
      "GitHub path is not a file."
    );

  }


  const content =
    base64Decode(
      data.content || ""
    );


  return {

    path: data.path,

    sha: data.sha,

    content,

    size: data.size

  };

}


// =====================================================
// GITHUB — UPDATE FILE
// =====================================================

async function updateGithubFile({
  path,
  content,
  sha,
  message
}) {

  safePath(path);


  if (!content) {

    throw new Error(
      "New file content is empty."
    );

  }


  const url =
    `${GITHUB_API}/repos/` +
    `${OWNER}/${REPO}/contents/` +
    `${encodeURIComponent(path)}`;


  const response =
    await fetch(
      url,
      {
        method: "PUT",

        headers:
          githubHeaders(),

        body:
          JSON.stringify({

            message:
              message ||
              "AyAI Development",

            content:
              base64Encode(content),

            sha,

            branch:
              BRANCH

          })
      }
    );


  const data =
    await response.json();


  if (!response.ok) {

    throw new Error(
      data?.message ||
      `GitHub update failed (${response.status})`
    );

  }


  return {

    commit:
      data.commit?.sha ||
      null,

    commitUrl:
      data.commit?.html_url ||
      null,

    contentSha:
      data.content?.sha ||
      null

  };

}


// =====================================================
// MAIN HANDLER
// =====================================================

export default async function handler(
  req,
  res
) {

  res.setHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "POST, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );


  if (
    req.method === "OPTIONS"
  ) {

    return res
      .status(200)
      .end();

  }


  if (
    req.method !== "POST"
  ) {

    return json(
      res,
      405,
      {
        ok: false,
        error:
          "Method not allowed"
      }
    );

  }


  try {

    validateConfig();


    const body =
      req.body || {};


    const action =
      body.action;


    if (!action) {

      return json(
        res,
        400,
        {
          ok: false,
          error:
            "Missing development action"
        }
      );

    }


    // =================================================
    // READ
    // =================================================

    if (
      action === "read"
    ) {

      const path =
        safePath(
          body.path ||
          "index.html"
        );


      const file =
        await getGithubFile(
          path
        );


      return json(
        res,
        200,
        {
          ok: true,

          action: "read",

          path:
            file.path,

          sha:
            file.sha,

          content:
            file.content
        }
      );

    }


    // =================================================
    // ANALYZE
    // =================================================

    if (
      action === "analyze"
    ) {

      const request =
        String(
          body.request ||
          ""
        ).trim();


      const path =
        safePath(
          body.path ||
          "index.html"
        );


      const proposedContent =
        String(
          body.proposedContent ||
          ""
        );


      if (!request) {

        return json(
          res,
          400,
          {
            ok: false,
            error:
              "Development request is empty"
          }
        );

      }


      if (!proposedContent) {

        return json(
          res,
          400,
          {
            ok: false,
            error:
              "proposedContent is required"
          }
        );

      }


      if (
        !proposedContent
          .toLowerCase()
          .includes("<html")
      ) {

        return json(
          res,
          400,
          {
            ok: false,
            error:
              "proposedContent does not appear to be valid HTML"
          }
        );

      }


      /*
       * اقرأ النسخة الحالية من GitHub.
       */

      const current =
        await getGithubFile(
          path
        );


      /*
       * Token مرتبط بـ:
       *
       * - الملف
       * - SHA الحالي
       * - محتوى التطوير
       * - الطلب
       *
       * لذلك لا يمكن استخدامه
       * لتطبيق محتوى مختلف.
       */

      const contentHash =
        sha256(
          proposedContent
        );


      const expiresAt =
        Date.now() +
        (
          15 *
          60 *
          1000
        );


      const token =
        createApprovalToken({

          version: 1,

          path,

          branch:
            BRANCH,

          currentSha:
            current.sha,

          contentHash,

          request,

          expiresAt

        });


      const plan = {

        title:
          "AyAI Development Plan",

        summary:
          "تم تحليل طلب التطوير وإنشاء نسخة جديدة بانتظار موافقة المستخدم.",

        request,

        changes: [
          "تحليل طلب المستخدم",
          "تجهيز نسخة جديدة من الملف",
          "التحقق من أن الملف الحالي لم يتغير",
          "انتظار موافقة المستخدم",
          "Commit إلى GitHub بعد الموافقة فقط"
        ],

        files: [
          path
        ],

        risk:
          "منخفض",

        apply:
          false,

        status:
          "WAITING_FOR_APPROVAL"

      };


      return json(
        res,
        200,
        {

          ok: true,

          action:
            "analyze",

          plan,

          approvalToken:
            token,

          expiresAt,

          currentSha:
            current.sha,

          contentHash

        }
      );

    }


    // =================================================
    // APPROVE
    // =================================================

    if (
      action === "approve"
    ) {

      const token =
        body.approvalToken;


      const payload =
        verifyApprovalToken(
          token
        );


      return json(
        res,
        200,
        {

          ok: true,

          action:
            "approve",

          status:
            "APPROVED",

          message:
            "تمت الموافقة. أصبح التطوير جاهزاً للتطبيق.",

          approvalToken:
            token,

          path:
            payload.path,

          expiresAt:
            payload.expiresAt

        }
      );

    }


    // =================================================
    // APPLY
    // =================================================

    if (
      action === "apply"
    ) {

      const token =
        body.approvalToken;


      const newContent =
        String(
          body.proposedContent ||
          ""
        );


      const message =
        String(
          body.message ||
          "AyAI Development"
        );


      if (!token) {

        return json(
          res,
          400,
          {
            ok: false,
            error:
              "Approval token is required."
          }
        );

      }


      if (!newContent) {

        return json(
          res,
          400,
          {
            ok: false,
            error:
              "proposedContent is required."
          }
        );

      }


      /*
       * تحقق من التوقيع
       * والصلاحية.
       */

      const payload =
        verifyApprovalToken(
          token
        );


      /*
       * تحقق من أن المحتوى
       * هو نفسه الذي تمت الموافقة عليه.
       */

      const incomingHash =
        sha256(
          newContent
        );


      if (
        incomingHash !==
        payload.contentHash
      ) {

        return json(
          res,
          409,
          {
            ok: false,
            error:
              "The proposed content does not match the approved development."
          }
        );

      }


      /*
       * نقرأ GitHub مرة ثانية.
       *
       * هذا مهم جداً:
       * إذا أحد عدّل index.html
       * بعد ANALYZE وقبل APPLY
       * نوقف العملية.
       */

      const current =
        await getGithubFile(
          payload.path
        );


      if (
        current.sha !==
        payload.currentSha
      ) {

        return json(
          res,
          409,
          {

            ok: false,

            error:
              "The GitHub file changed after analysis. Please analyze the development again.",

            currentSha:
              current.sha,

            approvedSha:
              payload.currentSha

          }
        );

      }


      /*
       * منع تطبيق نفس المحتوى.
       */

      if (
        current.content ===
        newContent
      ) {

        return json(
          res,
          400,
          {
            ok: false,
            error:
              "The proposed content is identical to the current file."
          }
        );

      }


      /*
       * الآن فقط:
       *
       * WRITE TO GITHUB
       */

      const result =
        await updateGithubFile({

          path:
            payload.path,

          content:
            newContent,

          sha:
            current.sha,

          message

        });


      return json(
        res,
        200,
        {

          ok: true,

          action:
            "apply",

          status:
            "APPLIED",

          message:
            "تم تطبيق التطوير على GitHub بنجاح.",

          path:
            payload.path,

          branch:
            BRANCH,

          commit:
            result.commit,

          commitUrl:
            result.commitUrl

        }
      );

    }


    // =================================================
    // UNKNOWN ACTION
    // =================================================

    return json(
      res,
      400,
      {

        ok: false,

        error:
          "Unknown development action",

        receivedAction:
          action,

        supportedActions: [
          "read",
          "analyze",
          "approve",
          "apply"
        ]

      }
    );


  } catch (error) {

    console.error(
      "Development Core Error:",
      error
    );


    return json(
      res,
      500,
      {

        ok: false,

        error:
          error.message ||
          "Development Core failed"

      }
    );

  }

}
