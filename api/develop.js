/*
====================================================
              AyAI DEVELOPMENT API
====================================================

Flow:

USER
  ↓
AyAI
  ↓
Development Core
  ↓
PLAN
  ↓
APPROVAL
  ↓
THIS API
  ↓
GitHub
  ↓
COMMIT

IMPORTANT:

هذا API لا يسمح بتعديل الكود إلا إذا:

approved === true

والملف موجود ضمن ALLOWED PATHS.

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

import {
    createDevelopmentPlan,
    addChange,
    addRisk,
    validatePlan,
    approvePlan,
    rejectPlan,
    prepareExecution,
    getApprovalSummary,
    isAllowedPath
} from "../brain/development-core.js";


/*
====================================================
 RESPONSE HELPERS
====================================================
*/

function success(res, data) {

    return res.status(200).json({

        success: true,

        ...data

    });

}


function failure(
    res,
    status,
    message
) {

    return res.status(status).json({

        success: false,

        error:
            message ||
            "Development API error."

    });

}


/*
====================================================
 ENVIRONMENT
====================================================
*/

function getConfig() {

    const TOKEN =
        process.env.GITHUB_TOKEN;

    const OWNER =
        process.env.GITHUB_OWNER;

    const REPO =
        process.env.GITHUB_REPO;

    const BRANCH =
        process.env.GITHUB_BRANCH ||
        "main";


    const allowedRaw =
        process.env.AYAI_ALLOWED_PATHS ||
        "index.html,brain/,api/";


    const allowedPaths =
        allowedRaw
            .split(",")
            .map(
                item =>
                    item.trim()
            )
            .filter(Boolean);


    return {

        TOKEN,
        OWNER,
        REPO,
        BRANCH,
        allowedPaths

    };

}


/*
====================================================
 CHECK CONFIG
====================================================
*/

function validateConfig(config) {

    if (!config.TOKEN) {

        return "GITHUB_TOKEN is missing.";

    }


    if (!config.OWNER) {

        return "GITHUB_OWNER is missing.";

    }


    if (!config.REPO) {

        return "GITHUB_REPO is missing.";

    }


    return null;

}


/*
====================================================
 GITHUB URL
====================================================
*/

function githubFileURL(
    owner,
    repo,
    path
) {

    const encodedPath =
        path
            .split("/")
            .map(
                encodeURIComponent
            )
            .join("/");


    return (
        `https://api.github.com/repos/` +
        `${encodeURIComponent(owner)}/` +
        `${encodeURIComponent(repo)}/` +
        `contents/${encodedPath}`
    );

}


/*
====================================================
 GITHUB HEADERS
====================================================
*/

function githubHeaders(
    token
) {

    return {

        "Accept":
            "application/vnd.github+json",

        "Authorization":
            `Bearer ${token}`,

        "X-GitHub-Api-Version":
            "2022-11-28",

        "Content-Type":
            "application/json"

    };

}


/*
====================================================
 READ GITHUB FILE
====================================================
*/

async function readGithubFile({

    token,
    owner,
    repo,
    branch,
    path

}) {

    const url =
        githubFileURL(
            owner,
            repo,
            path
        );


    const response =
        await fetch(

            `${url}?ref=${encodeURIComponent(
                branch
            )}`,

            {

                method:
                    "GET",

                headers:
                    githubHeaders(
                        token
                    )

            }

        );


    const data =
        await response.json();


    if (!response.ok) {

        if (
            response.status ===
            404
        ) {

            return {

                exists:
                    false,

                sha:
                    null,

                content:
                    null

            };

        }


        throw new Error(

            data.message ||
            "GitHub read failed."

        );

    }


    let content = "";


    if (
        data.encoding ===
        "base64"
    ) {

        content =
            Buffer
                .from(

                    data.content
                        .replace(
                            /\n/g,
                            ""
                        ),

                    "base64"

                )
                .toString(
                    "utf8"
                );

    }


    return {

        exists:
            true,

        sha:
            data.sha,

        content

    };

}


/*
====================================================
 WRITE GITHUB FILE
====================================================
*/

async function writeGithubFile({

    token,
    owner,
    repo,
    branch,
    path,
    content,
    message,
    sha

}) {

    const url =
        githubFileURL(
            owner,
            repo,
            path
        );


    const encoded =
        Buffer
            .from(
                content,
                "utf8"
            )
            .toString(
                "base64"
            );


    const payload = {

        message:
            message ||
            `AyAI Development: update ${path}`,

        content:
            encoded,

        branch

    };


    /*
    ----------------------------------------------
    إذا الملف موجود نرسل SHA
    ----------------------------------------------
    */

    if (sha) {

        payload.sha =
            sha;

    }


    const response =
        await fetch(

            url,

            {

                method:
                    "PUT",

                headers:
                    githubHeaders(
                        token
                    ),

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


    return data;

}


/*
====================================================
 CREATE PLAN
====================================================

يستخدم عندما AyAI يريد اقتراح تطوير.

لا يوجد أي تعديل هنا.
====================================================
*/

function handleCreatePlan(
    body
) {

    const {

        request,
        analysis,
        files

    } = body;


    if (!request) {

        throw new Error(
            "Missing development request."
        );

    }


    const plan =
        createDevelopmentPlan({

            request,

            analysis:

                analysis ||
                "AyAI is analyzing the requested development.",

            files:

                Array.isArray(files)
                    ? files
                    : []

        });


    return plan;

}


/*
====================================================
 ADD CHANGE
====================================================
*/

function handleAddChange(
    body
) {

    const {

        plan,
        path,
        action,
        description,
        reason,
        newContent

    } = body;


    if (!plan) {

        throw new Error(
            "Development plan is required."
        );

    }


    /*
    ----------------------------------------------
    لا نسمح بتعديل غير مصرح به
    ----------------------------------------------
    */

    if (
        !isAllowedPath(
            path
        )
    ) {

        throw new Error(
            `Unauthorized file path: ${path}`
        );

    }


    return addChange(

        plan,

        {

            path,

            action:
                action ||
                "modify",

            description:
                description || "",

            reason:
                reason || "",

            newContent

        }

    );

}


/*
====================================================
 ADD RISK
====================================================
*/

function handleAddRisk(
    body
) {

    const {

        plan,
        risk

    } = body;


    if (!plan) {

        throw new Error(
            "Development plan is required."
        );

    }


    return addRisk(
        plan,
        risk
    );

}


/*
====================================================
 APPROVE
====================================================

مهم:

الموافقة لا تعني أن أي ملف عشوائي
يمكن تعديله.

الخطة يتم فحصها أولاً.
====================================================
*/

function handleApprove(
    body
) {

    const {

        plan,
        approvalToken

    } = body;


    if (!plan) {

        throw new Error(
            "Development plan is required."
        );

    }


    /*
    ----------------------------------------------
    approvalToken يجب أن يكون موجوداً
    ----------------------------------------------
    */

    if (!approvalToken) {

        throw new Error(
            "Explicit approval is required."
        );

    }


    return approvePlan(

        plan,

        approvalToken

    );

}


/*
====================================================
 REJECT
====================================================
*/

function handleReject(
    body
) {

    const {
        plan
    } = body;


    if (!plan) {

        throw new Error(
            "Development plan is required."
        );

    }


    return rejectPlan(
        plan
    );

}


/*
====================================================
 EXECUTE DEVELOPMENT
====================================================

هذه هي المرحلة الوحيدة التي تعدل GitHub.

شروط التنفيذ:

1. plan موجود
2. plan.approved === true
3. status === APPROVED
4. الخطة Valid
5. كل الملفات مسموحة
====================================================
*/

async function handleExecute(
    body,
    config
) {

    const {
        plan,
        commitMessage
    } = body;


    if (!plan) {

        throw new Error(
            "Development plan is required."
        );

    }


    /*
    ----------------------------------------------
    VALIDATE
    ----------------------------------------------
    */

    const validation =
        validatePlan(
            plan
        );


    if (
        !validation.valid
    ) {

        throw new Error(

            validation.errors.join(
                "\n"
            )

        );

    }


    /*
    ----------------------------------------------
    APPROVAL CHECK
    ----------------------------------------------
    */

    if (
        plan.approved !== true
    ) {

        throw new Error(
            "Development has not been approved."
        );

    }


    if (
        plan.status !==
        "APPROVED"
    ) {

        throw new Error(
            "Development plan is not approved."
        );

    }


    /*
    ----------------------------------------------
    PREPARE
    ----------------------------------------------
    */

    const execution =
        prepareExecution(
            plan
        );


    /*
    ----------------------------------------------
    NO CHANGES
    ----------------------------------------------
    */

    if (
        !execution.changes.length
    ) {

        throw new Error(
            "No development changes found."
        );

    }


    const results = [];


    /*
    ----------------------------------------------
    EXECUTE EACH FILE
    ----------------------------------------------
    */

    for (
        const change
        of execution.changes
    ) {

        /*
        ------------------------------------------
        SECURITY CHECK
        ------------------------------------------
        */

        if (
            !isAllowedPath(
                change.path,
                config.allowedPaths
            )
        ) {

            throw new Error(

                `Unauthorized path: ${change.path}`

            );

        }


        /*
        ------------------------------------------
        Only modification supported
        ------------------------------------------
        */

        if (
            change.action !==
            "modify"
        ) {

            throw new Error(

                `Unsupported action "${change.action}" for ${change.path}`

            );

        }


        if (
            typeof change.content !==
            "string"
        ) {

            throw new Error(

                `Missing content for ${change.path}`

            );

        }


        /*
        ------------------------------------------
        READ CURRENT FILE
        ------------------------------------------
        */

        const current =
            await readGithubFile({

                token:
                    config.TOKEN,

                owner:
                    config.OWNER,

                repo:
                    config.REPO,

                branch:
                    config.BRANCH,

                path:
                    change.path

            });


        /*
        ------------------------------------------
        WRITE
        ------------------------------------------
        */

        const commit =
            await writeGithubFile({

                token:
                    config.TOKEN,

                owner:
                    config.OWNER,

                repo:
                    config.REPO,

                branch:
                    config.BRANCH,

                path:
                    change.path,

                content:
                    change.content,

                sha:
                    current.sha,

                message:

                    commitMessage ||

                    `AyAI Development: update ${change.path}`

            });


        results.push({

            path:
                change.path,

            success:
                true,

            commit:
                commit
                    ?.commit
                    ?.sha ||
                null

        });

    }


    /*
    ----------------------------------------------
    RETURN
    ----------------------------------------------
    */

    return {

        planId:
            plan.id,

        status:
            "EXECUTED",

        branch:
            config.BRANCH,

        results

    };

}


/*
====================================================
 GET PLAN SUMMARY
====================================================
*/

function handleSummary(
    body
) {

    const {
        plan
    } = body;


    if (!plan) {

        throw new Error(
            "Development plan is required."
        );

    }


    return getApprovalSummary(
        plan
    );

}


/*
====================================================
 MAIN HANDLER
====================================================
*/

export default async function handler(
    req,
    res
) {

    /*
    ----------------------------------------------
    METHOD
    ----------------------------------------------
    */

    if (
        req.method !==
        "POST"
    ) {

        return failure(

            res,

            405,

            "Only POST requests are allowed."

        );

    }


    try {

        const body =
            req.body || {};


        const action =
            body.action;


        /*
        ------------------------------------------
        CONFIG
        ------------------------------------------
        */

        const config =
            getConfig();


        const configError =
            validateConfig(
                config
            );


        if (configError) {

            return failure(

                res,

                500,

                configError

            );

        }


        /*
        ==========================================
        CREATE PLAN
        ==========================================
        */

        if (
            action ===
            "create_plan"
        ) {

            const plan =
                handleCreatePlan(
                    body
                );


            return success(
                res,
                {

                    action:
                        "create_plan",

                    plan,

                    summary:
                        getApprovalSummary(
                            plan
                        )

                }
            );

        }


        /*
        ==========================================
        ADD CHANGE
        ==========================================
        */

        if (
            action ===
            "add_change"
        ) {

            const plan =
                handleAddChange(
                    body
                );


            return success(
                res,
                {

                    action:
                        "add_change",

                    plan,

                    summary:
                        getApprovalSummary(
                            plan
                        )

                }
            );

        }


        /*
        ==========================================
        ADD RISK
        ==========================================
        */

        if (
            action ===
            "add_risk"
        ) {

            const plan =
                handleAddRisk(
                    body
                );


            return success(
                res,
                {

                    action:
                        "add_risk",

                    plan

                }
            );

        }


        /*
        ==========================================
        SUMMARY
        ==========================================
        */

        if (
            action ===
            "summary"
        ) {

            const summary =
                handleSummary(
                    body
                );


            return success(
                res,
                {

                    action:
                        "summary",

                    summary

                }
            );

        }


        /*
        ==========================================
        APPROVE
        ==========================================
        */

        if (
            action ===
            "approve"
        ) {

            const plan =
                handleApprove(
                    body
                );


            return success(
                res,
                {

                    action:
                        "approve",

                    plan,

                    message:
                        "Development approved. Ready for execution."

                }
            );

        }


        /*
        ==========================================
        REJECT
        ==========================================
        */

        if (
            action ===
            "reject"
        ) {

            const plan =
                handleReject(
                    body
                );


            return success(
                res,
                {

                    action:
                        "reject",

                    plan,

                    message:
                        "Development rejected."

                }
            );

        }


        /*
        ==========================================
        EXECUTE
        ==========================================
        */

        if (
            action ===
            "execute"
        ) {

            const result =
                await handleExecute(
                    body,
                    config
                );


            return success(
                res,
                {

                    action:
                        "execute",

                    result,

                    message:
                        "AyAI development executed successfully."

                }
            );

        }


        /*
        ==========================================
        UNKNOWN ACTION
        ==========================================
        */

        return failure(

            res,

            400,

            "Unknown development action."

        );

    } catch (error) {

        console.error(
            "AyAI Development API Error:",
            error
        );


        return failure(

            res,

            500,

            error.message ||
            "Development server error."

        );

    }

}
