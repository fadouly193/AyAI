/*
====================================================
                 AyAI DEVELOPMENT API
====================================================

ENVIRONMENT VARIABLES:

GITHUB_TOKEN
GITHUB_OWNER
GITHUB_REPO
GITHUB_BRANCH

AYAI_APPROVAL_TOKEN

AYAI_ALLOWED_PATHS
مثال:
index.html,api/,brain/

====================================================
*/

export default async function handler(req, res) {

    if (req.method !== "POST") {
        return res.status(405).json({
            error: "Only POST requests are allowed"
        });
    }

    try {

        const {
            action,
            path,
            content,
            message,
            approvalToken
        } = req.body || {};


        /*
        ====================================================
        ENVIRONMENT
        ====================================================
        */

        const TOKEN =
            process.env.GITHUB_TOKEN;

        const OWNER =
            process.env.GITHUB_OWNER;

        const REPO =
            process.env.GITHUB_REPO;

        const BRANCH =
            process.env.GITHUB_BRANCH || "main";

        const SERVER_APPROVAL_TOKEN =
            process.env.AYAI_APPROVAL_TOKEN;


        if (
            !TOKEN ||
            !OWNER ||
            !REPO ||
            !SERVER_APPROVAL_TOKEN
        ) {

            return res.status(500).json({
                error:
                    "AyAI development environment is not configured."
            });

        }


        /*
        ====================================================
        APPROVAL SECURITY
        ====================================================
        */

        if (
            typeof approvalToken !== "string" ||
            approvalToken !== SERVER_APPROVAL_TOKEN
        ) {

            return res.status(403).json({
                error:
                    "Development requires valid approval."
            });

        }


        /*
        ====================================================
        ALLOWED FILES
        ====================================================
        */

        const allowedRaw =
            process.env.AYAI_ALLOWED_PATHS ||
            "index.html,api/,brain/";

        const allowed =
            allowedRaw
                .split(",")
                .map(x => x.trim())
                .filter(Boolean);


        function isAllowed(filePath) {

            if (!filePath) {
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
        ====================================================
        PATH VALIDATION
        ====================================================
        */

        if (!path) {

            return res.status(400).json({
                error: "Missing file path."
            });

        }


        /*
        منع الخروج من مجلد المشروع
        */

        if (
            path.includes("..") ||
            path.startsWith("/") ||
            path.includes("\\")
        ) {

            return res.status(403).json({
                error: "Invalid file path."
            });

        }


        if (!isAllowed(path)) {

            return res.status(403).json({
                error:
                    "This file is not allowed to be modified."
            });

        }


        /*
        ====================================================
        GITHUB API
        ====================================================
        */

        const base =
            `https://api.github.com/repos/` +
            `${encodeURIComponent(OWNER)}/` +
            `${encodeURIComponent(REPO)}/contents/`;


        const url =
            base +
            path
                .split("/")
                .map(encodeURIComponent)
                .join("/");


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


        /*
        ====================================================
        READ
        ====================================================
        */

        if (action === "read") {

            const response =
                await fetch(
                    `${url}?ref=${encodeURIComponent(BRANCH)}`,
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

                    error:
                        data.message ||
                        "GitHub read failed."

                });

            }


            let decoded = "";


            if (data.encoding === "base64") {

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

                action: "read",

                path: data.path,

                sha: data.sha,

                content: decoded

            });

        }


        /*
        ====================================================
        WRITE
        ====================================================
        */

        if (action === "write") {

            if (
                typeof content !== "string"
            ) {

                return res.status(400).json({
                    error:
                        "Missing file content."
                });

            }


            /*
            --------------------------------------------
            READ CURRENT FILE
            --------------------------------------------
            */

            const currentResponse =
                await fetch(
                    `${url}?ref=${encodeURIComponent(BRANCH)}`,
                    {
                        method: "GET",
                        headers
                    }
                );


            let current = null;


            if (currentResponse.ok) {

                current =
                    await currentResponse.json();

            }


            /*
            --------------------------------------------
            BASE64
            --------------------------------------------
            */

            const encoded =
                Buffer
                    .from(content, "utf8")
                    .toString("base64");


            const payload = {

                message:
                    message ||
                    `AyAI approved development: update ${path}`,

                content:
                    encoded,

                branch:
                    BRANCH

            };


            /*
            --------------------------------------------
            EXISTING FILE
            --------------------------------------------
            */

            if (
                current &&
                current.sha
            ) {

                payload.sha =
                    current.sha;

            }


            /*
            --------------------------------------------
            GITHUB WRITE
            --------------------------------------------
            */

            const response =
                await fetch(
                    url,
                    {

                        method: "PUT",

                        headers,

                        body:
                            JSON.stringify(payload)

                    }
                );


            const data =
                await response.json();


            if (!response.ok) {

                return res.status(
                    response.status
                ).json({

                    error:
                        data.message ||
                        "GitHub write failed."

                });

            }


            return res.status(200).json({

                success: true,

                action: "write",

                path,

                commit:
                    data.commit?.sha || null,

                message:
                    "Approved development applied successfully."

            });

        }


        /*
        ====================================================
        UNKNOWN ACTION
        ====================================================
        */

        return res.status(400).json({

            error:
                "Unknown development action."

        });


    } catch (error) {

        console.error(
            "AyAI Development API:",
            error
        );


        return res.status(500).json({

            error:
                error.message ||
                "Development server error."

        });

    }

}
