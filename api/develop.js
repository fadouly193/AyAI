/*
====================================================
              AyAI DEVELOPMENT CORE
====================================================

Supported actions:

analyze
approve
apply
read
write

Environment Variables:

GITHUB_TOKEN
GITHUB_OWNER
GITHUB_REPO
GITHUB_BRANCH

Optional:

AYAI_ALLOWED_PATHS

Example:

index.html,brain/,api/
====================================================
*/

export default async function handler(req, res) {

    /*
    ==================================================
    METHOD
    ==================================================
    */

    if (req.method !== "POST") {

        return res.status(405).json({
            success: false,
            error: "Only POST requests are allowed."
        });

    }


    try {

        const body = req.body || {};

        const action =
            body.action || "";

        const path =
            body.path || "";

        const content =
            body.content;

        const message =
            body.message || "";

        const approved =
            body.approved === true;

        const files =
            Array.isArray(body.files)
                ? body.files
                : [];


        /*
        ==================================================
        ENVIRONMENT
        ==================================================
        */

        const TOKEN =
            process.env.GITHUB_TOKEN;

        const OWNER =
            process.env.GITHUB_OWNER;

        const REPO =
            process.env.GITHUB_REPO;

        const BRANCH =
            process.env.GITHUB_BRANCH || "main";


        if (!TOKEN) {

            return res.status(500).json({
                success: false,
                error: "GITHUB_TOKEN is missing."
            });

        }


        if (!OWNER) {

            return res.status(500).json({
                success: false,
                error: "GITHUB_OWNER is missing."
            });

        }


        if (!REPO) {

            return res.status(500).json({
                success: false,
                error: "GITHUB_REPO is missing."
            });

        }


        /*
        ==================================================
        ALLOWED PATHS
        ==================================================
        */

        const allowedRaw =
            process.env.AYAI_ALLOWED_PATHS ||
            "index.html,brain/,api/";


        const allowed =
            allowedRaw
                .split(",")
                .map(x => x.trim())
                .filter(Boolean);


        function isAllowed(filePath) {

            if (!filePath) {
                return false;
            }

            /*
            Prevent dangerous paths
            */

            if (
                filePath.includes("..") ||
                filePath.startsWith("/") ||
                filePath.includes("\\")
            ) {

                return false;

            }


            return allowed.some(rule => {

                if (rule.endsWith("/")) {

                    return filePath.startsWith(rule);

                }

                return filePath === rule;

            });

        }


        /*
        ==================================================
        GITHUB BASE
        ==================================================
        */

        const base =
            `https://api.github.com/repos/` +
            `${encodeURIComponent(OWNER)}/` +
            `${encodeURIComponent(REPO)}/contents/`;


        const headers = {

            "Accept":
                "application/vnd.github+json",

            "Authorization":
                `Bearer ${TOKEN}`,

            "X-GitHub-Api-Version":
                "2022-11-28",

            "Content-Type":
                "application/json"

        };


        function githubUrl(filePath) {

            return (
                base +
                filePath
                    .split("/")
                    .map(encodeURIComponent)
                    .join("/")
            );

        }


        /*
        ==================================================
        ACTION: ANALYZE
        ==================================================

        This DOES NOT modify GitHub.

        It only prepares a development plan.
        ==================================================
        */

        if (action === "analyze") {

            const requestedPath =
                path || "index.html";


            /*
            Validate path if supplied
            */

            if (
                path &&
                !isAllowed(path)
            ) {

                return res.status(403).json({

                    success: false,

                    error:
                        "This file is not allowed to be modified.",

                    path

                });

            }


            /*
            If frontend sends multiple files
            */

            const analyzedFiles =
                files.length > 0
                    ? files.map(file => ({
                        path: file.path,
                        status:
                            isAllowed(file.path)
                                ? "ALLOWED"
                                : "BLOCKED"
                    }))
                    : [
                        {
                            path: requestedPath,
                            status:
                                isAllowed(requestedPath)
                                    ? "ALLOWED"
                                    : "BLOCKED"
                        }
                    ];


            const blocked =
                analyzedFiles.filter(
                    file =>
                        file.status === "BLOCKED"
                );


            if (blocked.length > 0) {

                return res.status(403).json({

                    success: false,

                    error:
                        "One or more requested files are not allowed.",

                    files:
                        analyzedFiles

                });

            }


            /*
            Development plan
            */

            const plan = {

                title:
                    "AyAI Development Plan",

                request:
                    message ||
                    "Development request received.",

                files:
                    analyzedFiles,

                changes: [

                    "Analyze the requested development.",

                    "Prepare the required code changes.",

                    "Validate the requested files.",

                    "Wait for explicit user approval.",

                    "Apply the approved changes to GitHub."

                ],

                risks: [

                    "Existing functionality may be affected.",

                    "Frontend behavior may change.",

                    "The application should be tested after deployment."

                ],

                approvalRequired:
                    true

            };


            return res.status(200).json({

                success: true,

                action:
                    "analyze",

                status:
                    "WAITING_FOR_APPROVAL",

                plan

            });

        }


        /*
        ==================================================
        ACTION: APPROVE
        ==================================================

        Approval endpoint.

        IMPORTANT:
        Approval alone does not magically know the code.
        The frontend must send the proposed files/content.
        ==================================================
        */

        if (
            action === "approve" ||
            action === "apply"
        ) {

            if (!approved) {

                return res.status(403).json({

                    success: false,

                    error:
                        "Development requires explicit approval."

                });

            }


            /*
            ==================================================
            MULTI FILE DEVELOPMENT
            ==================================================
            */

            if (files.length > 0) {

                const results = [];


                for (const file of files) {

                    if (
                        !file ||
                        typeof file.path !== "string" ||
                        typeof file.content !== "string"
                    ) {

                        return res.status(400).json({

                            success: false,

                            error:
                                "Each file must contain path and content."

                        });

                    }


                    if (!isAllowed(file.path)) {

                        return res.status(403).json({

                            success: false,

                            error:
                                `File not allowed: ${file.path}`

                        });

                    }


                    const result =
                        await writeFile(
                            file.path,
                            file.content,
                            file.message ||
                            message ||
                            `AyAI approved development: ${file.path}`
                        );


                    results.push(result);

                }


                return res.status(200).json({

                    success: true,

                    action:
                        "approve",

                    status:
                        "DEVELOPMENT_APPLIED",

                    results

                });

            }


            /*
            ==================================================
            SINGLE FILE DEVELOPMENT
            ==================================================
            */

            if (!path) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Missing file path."

                });

            }


            if (!isAllowed(path)) {

                return res.status(403).json({

                    success: false,

                    error:
                        "This file is not allowed to be modified."

                });

            }


            if (typeof content !== "string") {

                return res.status(400).json({

                    success: false,

                    error:
                        "Missing file content."

                });

            }


            const result =
                await writeFile(
                    path,
                    content,
                    message ||
                    `AyAI approved development: ${path}`
                );


            return res.status(200).json({

                success: true,

                action:
                    "approve",

                status:
                    "DEVELOPMENT_APPLIED",

                result

            });

        }


        /*
        ==================================================
        ACTION: READ
        ==================================================
        */

        if (action === "read") {

            if (!path) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Missing file path."

                });

            }


            if (!isAllowed(path)) {

                return res.status(403).json({

                    success: false,

                    error:
                        "This file is not allowed to be read."

                });

            }


            const response =
                await fetch(
                    `${githubUrl(path)}?ref=${encodeURIComponent(BRANCH)}`,
                    {
                        method: "GET",
                        headers
                    }
                );


            const data =
                await response.json();


            if (!response.ok) {

                return res.status(
                    response.status
                ).json({

                    success: false,

                    error:
                        data.message ||
                        "GitHub read failed."

                });

            }


            let decoded = "";


            if (
                data.encoding === "base64"
            ) {

                decoded =
                    Buffer
                        .from(
                            data.content.replace(/\n/g, ""),
                            "base64"
                        )
                        .toString("utf8");

            }


            return res.status(200).json({

                success: true,

                action:
                    "read",

                path:
                    data.path,

                sha:
                    data.sha,

                content:
                    decoded

            });

        }


        /*
        ==================================================
        ACTION: WRITE
        ==================================================

        Legacy direct write.

        Still requires approval.
        ==================================================
        */

        if (action === "write") {

            if (!approved) {

                return res.status(403).json({

                    success: false,

                    error:
                        "Writing files requires explicit approval."

                });

            }


            if (!path) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Missing file path."

                });

            }


            if (!isAllowed(path)) {

                return res.status(403).json({

                    success: false,

                    error:
                        "This file is not allowed to be modified."

                });

            }


            if (typeof content !== "string") {

                return res.status(400).json({

                    success: false,

                    error:
                        "Missing file content."

                });

            }


            const result =
                await writeFile(
                    path,
                    content,
                    message ||
                    `AyAI development: update ${path}`
                );


            return res.status(200).json({

                success: true,

                action:
                    "write",

                status:
                    "DEVELOPMENT_APPLIED",

                result

            });

        }


        /*
        ==================================================
        UNKNOWN ACTION
        ==================================================
        */

        return res.status(400).json({

            success: false,

            error:
                "Unknown development action.",

            receivedAction:
                action,

            supportedActions: [

                "analyze",
                "approve",
                "apply",
                "read",
                "write"

            ]

        });


        /*
        ==================================================
        GITHUB WRITE FUNCTION
        ==================================================
        */

        async function writeFile(
            filePath,
            fileContent,
            commitMessage
        ) {

            const url =
                githubUrl(filePath);


            /*
            ----------------------------------------------
            Get current file
            ----------------------------------------------
            */

            const currentResponse =
                await fetch(
                    `${url}?ref=${encodeURIComponent(BRANCH)}`,
                    {
                        method: "GET",
                        headers
                    }
                );


            let current =
                null;


            if (currentResponse.ok) {

                current =
                    await currentResponse.json();

            }


            /*
            ----------------------------------------------
            Encode content
            ----------------------------------------------
            */

            const encoded =
                Buffer
                    .from(
                        fileContent,
                        "utf8"
                    )
                    .toString("base64");


            const payload = {

                message:
                    commitMessage,

                content:
                    encoded,

                branch:
                    BRANCH

            };


            /*
            ----------------------------------------------
            Existing file SHA
            ----------------------------------------------
            */

            if (
                current &&
                current.sha
            ) {

                payload.sha =
                    current.sha;

            }


            /*
            ----------------------------------------------
            Write to GitHub
            ----------------------------------------------
            */

            const response =
                await fetch(
                    url,
                    {

                        method:
                            "PUT",

                        headers,

                        body:
                            JSON.stringify(
                                payload
                            )

                    }
                );


            const data =
                await response.json();


            if (!response.ok) {

                throw new Error(
                    data.message ||
                    "GitHub write failed."
                );

            }


            return {

                path:
                    filePath,

                commit:
                    data.commit?.sha ||
                    null,

                message:
                    "File updated successfully."

            };

        }


    } catch (error) {

        console.error(
            "AyAI Development Core Error:",
            error
        );


        return res.status(500).json({

            success: false,

            error:
                error.message ||
                "Development server error."

        });

    }

}
