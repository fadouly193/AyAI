/*
========================================================
                 AyAI DEVELOPMENT CORE
========================================================

Required Vercel Environment Variables:

GROQ_API_KEY
GITHUB_TOKEN
GITHUB_OWNER
GITHUB_REPO
GITHUB_BRANCH

Required:
DEV_APPROVAL_SECRET

Optional:
AYAI_ALLOWED_PATHS

Example:
index.html,api/,brain/

Flow:

ANALYZE
   ↓
Read allowed files from GitHub
   ↓
Groq creates development proposal
   ↓
User reviews proposal
   ↓
APPROVE & APPLY
   ↓
Signed approval verified
   ↓
GitHub commit
========================================================
*/

import crypto from "crypto";


// ======================================================
// MAIN HANDLER
// ======================================================

export default async function handler(req, res) {

    if (req.method !== "POST") {

        return res.status(405).json({
            error: "Only POST requests are allowed."
        });

    }

    try {

        const body = req.body || {};

        const action = body.action;

        // ==================================================
        // ENVIRONMENT
        // ==================================================

        const GROQ_API_KEY =
            process.env.GROQ_API_KEY;

        const GITHUB_TOKEN =
            process.env.GITHUB_TOKEN;

        const GITHUB_OWNER =
            process.env.GITHUB_OWNER;

        const GITHUB_REPO =
            process.env.GITHUB_REPO;

        const GITHUB_BRANCH =
            process.env.GITHUB_BRANCH || "main";

        const DEV_APPROVAL_SECRET =
            process.env.DEV_APPROVAL_SECRET;


        if (!GROQ_API_KEY) {

            return res.status(500).json({
                error: "GROQ_API_KEY is missing."
            });

        }

        if (
            !GITHUB_TOKEN ||
            !GITHUB_OWNER ||
            !GITHUB_REPO
        ) {

            return res.status(500).json({
                error:
                    "GitHub environment variables are missing."
            });

        }

        if (!DEV_APPROVAL_SECRET) {

            return res.status(500).json({
                error:
                    "DEV_APPROVAL_SECRET is missing."
            });

        }


        // ==================================================
        // ALLOWED FILES
        // ==================================================

        const allowedRaw =
            process.env.AYAI_ALLOWED_PATHS ||
            "index.html,api/,brain/";


        const allowedPaths =
            allowedRaw
                .split(",")
                .map(x => x.trim())
                .filter(Boolean);


        function isAllowed(filePath) {

            if (!filePath) {
                return false;
            }

            // Prevent path traversal
            if (
                filePath.includes("..") ||
                filePath.startsWith("/") ||
                filePath.includes("\\")
            ) {

                return false;

            }

            return allowedPaths.some(rule => {

                if (rule.endsWith("/")) {

                    return filePath.startsWith(rule);

                }

                return filePath === rule;

            });

        }


        // ==================================================
        // GITHUB HELPERS
        // ==================================================

        const githubBase =
            `https://api.github.com/repos/` +
            `${encodeURIComponent(GITHUB_OWNER)}/` +
            `${encodeURIComponent(GITHUB_REPO)}/contents/`;


        const githubHeaders = {

            "Accept":
                "application/vnd.github+json",

            "Authorization":
                `Bearer ${GITHUB_TOKEN}`,

            "X-GitHub-Api-Version":
                "2022-11-28",

            "Content-Type":
                "application/json"

        };


        function githubFileUrl(filePath) {

            return (
                githubBase +
                filePath
                    .split("/")
                    .map(encodeURIComponent)
                    .join("/")
            );

        }


        async function readGithubFile(filePath) {

            if (!isAllowed(filePath)) {

                throw new Error(
                    `File not allowed: ${filePath}`
                );

            }


            const response =
                await fetch(
                    `${githubFileUrl(filePath)}?ref=${encodeURIComponent(GITHUB_BRANCH)}`,
                    {
                        method: "GET",
                        headers: githubHeaders
                    }
                );


            const data =
                await response.json();


            if (!response.ok) {

                throw new Error(
                    data.message ||
                    `Unable to read ${filePath}`
                );

            }


            let content = "";


            if (data.encoding === "base64") {

                content =
                    Buffer
                        .from(
                            data.content.replace(/\n/g, ""),
                            "base64"
                        )
                        .toString("utf8");

            } else {

                content =
                    data.content || "";

            }


            return {

                path: data.path,

                sha: data.sha,

                content

            };

        }


        // ==================================================
        // HMAC SIGNING
        // ==================================================

        function createApprovalSignature(proposal) {

            const payload =
                JSON.stringify(proposal);


            return crypto
                .createHmac(
                    "sha256",
                    DEV_APPROVAL_SECRET
                )
                .update(payload)
                .digest("hex");

        }


        function safeEqual(a, b) {

            if (
                typeof a !== "string" ||
                typeof b !== "string"
            ) {

                return false;

            }


            const aa =
                Buffer.from(a, "utf8");

            const bb =
                Buffer.from(b, "utf8");


            if (aa.length !== bb.length) {

                return false;

            }


            return crypto.timingSafeEqual(
                aa,
                bb
            );

        }


        // ==================================================
        // ACTION: ANALYZE
        // ==================================================

        if (action === "analyze") {

            const userRequest =
                String(body.request || "").trim();


            if (!userRequest) {

                return res.status(400).json({

                    error:
                        "Development request is missing."

                });

            }


            // ----------------------------------------------
            // Determine files to inspect
            // ----------------------------------------------

            let filesToRead = [
                "index.html"
            ];


            if (
                Array.isArray(body.files) &&
                body.files.length > 0
            ) {

                filesToRead =
                    body.files
                        .filter(
                            file =>
                                typeof file === "string"
                        )
                        .filter(isAllowed)
                        .slice(0, 10);

            }


            // ----------------------------------------------
            // Read files
            // ----------------------------------------------

            const sourceFiles = [];


            for (
                const filePath
                of filesToRead
            ) {

                try {

                    const file =
                        await readGithubFile(
                            filePath
                        );


                    sourceFiles.push({

                        path:
                            file.path,

                        content:
                            file.content

                    });

                } catch (error) {

                    console.error(
                        `Read failed: ${filePath}`,
                        error
                    );

                }

            }


            if (sourceFiles.length === 0) {

                return res.status(500).json({

                    error:
                        "Could not read project files from GitHub."

                });

            }


            // ----------------------------------------------
            // Build AI prompt
            // ----------------------------------------------

            const sourceText =
                sourceFiles
                    .map(file => {

                        return `
===== FILE: ${file.path} =====

${file.content}

===== END FILE =====
`;

                    })
                    .join("\n");


            const systemPrompt = `
You are AyAI Development Core.

Your job is to analyze a user's requested software improvement
and prepare a SAFE development proposal.

IMPORTANT RULES:

1. Never make changes yourself.
2. Return ONLY valid JSON.
3. Only propose changes to files explicitly provided.
4. Do not create arbitrary files.
5. Do not modify secrets, environment variables, GitHub tokens,
   authentication systems, or deployment configuration.
6. Preserve existing functionality unless the request requires
   changing it.
7. Return complete replacement file contents for every file that
   needs modification.
8. If no safe modification can be determined, return an empty
   changes array.
9. Keep the proposal understandable to the user.

JSON FORMAT:

{
  "title": "short title",
  "summary": "what will be improved",
  "reason": "why the change is useful",
  "risks": [
    "possible risk"
  ],
  "expectedResult": "expected result",
  "changes": [
    {
      "path": "index.html",
      "reason": "why this file changes",
      "content": "COMPLETE FILE CONTENT"
    }
  ]
}
`;


            const userPrompt = `
USER DEVELOPMENT REQUEST:

${userRequest}

PROJECT FILES:

${sourceText}
`;


            // ----------------------------------------------
            // Ask Groq
            // ----------------------------------------------

            const groqResponse =
                await fetch(
                    "https://api.groq.com/openai/v1/chat/completions",
                    {

                        method: "POST",

                        headers: {

                            "Content-Type":
                                "application/json",

                            "Authorization":
                                `Bearer ${GROQ_API_KEY}`

                        },

                        body:
                            JSON.stringify({

                                model:
                                    "llama-3.3-70b-versatile",

                                messages: [

                                    {
                                        role: "system",
                                        content:
                                            systemPrompt
                                    },

                                    {
                                        role: "user",
                                        content:
                                            userPrompt
                                    }

                                ],

                                temperature:
                                    0.2,

                                max_completion_tokens:
                                    16000,

                                response_format: {
                                    type: "json_object"
                                }

                            })

                    }
                );


            const groqData =
                await groqResponse.json();


            if (!groqResponse.ok) {

                return res.status(
                    groqResponse.status
                ).json({

                    error:
                        groqData?.error?.message ||
                        "Groq analysis failed."

                });

            }


            const raw =
                groqData
                    ?.choices?.[0]
                    ?.message?.content;


            if (!raw) {

                return res.status(500).json({

                    error:
                        "Groq returned no development proposal."

                });

            }


            let proposal;


            try {

                proposal =
                    JSON.parse(raw);

            } catch {

                return res.status(500).json({

                    error:
                        "AI returned invalid development JSON."

                });

            }


            // ----------------------------------------------
            // Validate proposal
            // ----------------------------------------------

            if (
                !Array.isArray(
                    proposal.changes
                )
            ) {

                proposal.changes = [];

            }


            proposal.changes =
                proposal.changes
                    .filter(change => {

                        return (
                            change &&
                            typeof change.path === "string" &&
                            typeof change.content === "string" &&
                            isAllowed(change.path)
                        );

                    })
                    .slice(0, 5);


            // ----------------------------------------------
            // Create signed approval
            // ----------------------------------------------

            const approvalPayload = {

                title:
                    proposal.title ||
                    "AyAI Development",

                summary:
                    proposal.summary ||
                    "",

                reason:
                    proposal.reason ||
                    "",

                risks:
                    Array.isArray(proposal.risks)
                        ? proposal.risks
                        : [],

                expectedResult:
                    proposal.expectedResult ||
                    "",

                changes:
                    proposal.changes.map(change => ({

                        path:
                            change.path,

                        reason:
                            change.reason ||
                            "",

                        content:
                            change.content

                    }))

            };


            const approvalToken =
                createApprovalSignature(
                    approvalPayload
                );


            return res.status(200).json({

                success: true,

                proposal:
                    approvalPayload,

                approvalToken

            });

        }


        // ==================================================
        // ACTION: APPLY
        // ==================================================

        if (action === "apply") {

            const proposal =
                body.proposal;


            const approvalToken =
                body.approvalToken;


            if (
                !proposal ||
                typeof proposal !== "object"
            ) {

                return res.status(400).json({

                    error:
                        "Development proposal is missing."

                });

            }


            if (
                !approvalToken ||
                typeof approvalToken !== "string"
            ) {

                return res.status(403).json({

                    error:
                        "Approval token is missing."

                });

            }


            // ----------------------------------------------
            // Verify approval
            // ----------------------------------------------

            const expectedSignature =
                createApprovalSignature(
                    proposal
                );


            if (
                !safeEqual(
                    approvalToken,
                    expectedSignature
                )
            ) {

                return res.status(403).json({

                    error:
                        "Invalid approval. The proposal was modified or is not approved."

                });

            }


            // ----------------------------------------------
            // Validate changes
            // ----------------------------------------------

            if (
                !Array.isArray(
                    proposal.changes
                ) ||
                proposal.changes.length === 0
            ) {

                return res.status(400).json({

                    error:
                        "There are no approved changes to apply."

                });

            }


            for (
                const change
                of proposal.changes
            ) {

                if (
                    !change ||
                    typeof change.path !== "string" ||
                    typeof change.content !== "string"
                ) {

                    return res.status(400).json({

                        error:
                            "Invalid development change."

                    });

                }


                if (
                    !isAllowed(
                        change.path
                    )
                ) {

                    return res.status(403).json({

                        error:
                            `File is not allowed: ${change.path}`

                    });

                }

            }


            // ----------------------------------------------
            // Apply files
            // ----------------------------------------------

            const applied = [];


            for (
                const change
                of proposal.changes
            ) {

                const fileUrl =
                    githubFileUrl(
                        change.path
                    );


                // Get latest SHA
                const currentResponse =
                    await fetch(
                        `${fileUrl}?ref=${encodeURIComponent(GITHUB_BRANCH)}`,
                        {
                            method: "GET",
                            headers: githubHeaders
                        }
                    );


                let current = null;


                if (
                    currentResponse.ok
                ) {

                    current =
                        await currentResponse.json();

                }


                const encoded =
                    Buffer
                        .from(
                            change.content,
                            "utf8"
                        )
                        .toString("base64");


                const payload = {

                    message:
                        `AyAI Development: ${change.path}`,

                    content:
                        encoded,

                    branch:
                        GITHUB_BRANCH

                };


                if (
                    current &&
                    current.sha
                ) {

                    payload.sha =
                        current.sha;

                }


                const writeResponse =
                    await fetch(
                        fileUrl,
                        {

                            method: "PUT",

                            headers:
                                githubHeaders,

                            body:
                                JSON.stringify(
                                    payload
                                )

                        }
                    );


                const writeData =
                    await writeResponse.json();


                if (
                    !writeResponse.ok
                ) {

                    return res.status(
                        writeResponse.status
                    ).json({

                        error:
                            writeData?.message ||
                            `Failed to update ${change.path}`,

                        applied

                    });

                }


                applied.push({

                    path:
                        change.path,

                    commit:
                        writeData
                            ?.commit
                            ?.sha ||
                        null

                });

            }


            return res.status(200).json({

                success: true,

                message:
                    "Development applied successfully.",

                applied

            });

        }


        // ==================================================
        // ACTION: READ
        // ==================================================

        if (action === "read") {

            const filePath =
                String(
                    body.path || ""
                ).trim();


            if (
                !isAllowed(filePath)
            ) {

                return res.status(403).json({

                    error:
                        "This file is not allowed."

                });

            }


            const file =
                await readGithubFile(
                    filePath
                );


            return res.status(200).json({

                success: true,

                path:
                    file.path,

                sha:
                    file.sha,

                content:
                    file.content

            });

        }


        // ==================================================
        // UNKNOWN ACTION
        // ==================================================

        return res.status(400).json({

            error:
                "Unknown development action.",

            supportedActions: [
                "analyze",
                "apply",
                "read"
            ]

        });


    } catch (error) {

        console.error(
            "AyAI Development Core Error:",
            error
        );


        return res.status(500).json({

            error:
                error.message ||
                "Development server error."

        });

    }

}
