/*
====================================================
                 AyAI DEVELOPMENT CORE
====================================================

وظيفة هذا الملف:

1. تحليل طلب التطوير
2. إنشاء خطة تطوير
3. تحديد الملفات التي تحتاج تعديل
4. شرح التغييرات للمستخدم
5. انتظار APPROVAL
6. بعد الموافقة فقط يتم تنفيذ التعديل
7. لا يسمح بالتعديل الذاتي المباشر

Architecture:

USER
  ↓
AyAI
  ↓
Development Core
  ↓
PLAN
  ↓
USER APPROVAL
  ↓
DEVELOP API
  ↓
GITHUB
  ↓
COMMIT
====================================================
*/

const DEVELOPMENT_VERSION = "1.0.0";


/*
====================================================
 CONFIGURATION
====================================================
*/

const DEFAULT_ALLOWED_PATHS = [
    "index.html",
    "brain/",
    "api/"
];


/*
====================================================
 NORMALIZE REQUEST
====================================================
*/

function normalizeRequest(request) {

    if (
        typeof request !== "string"
    ) {

        return "";

    }

    return request
        .trim()
        .slice(0, 5000);

}


/*
====================================================
 CREATE DEVELOPMENT PLAN
====================================================

هذه الوظيفة لا تعدل أي ملف.

فقط تنشئ خطة.
====================================================
*/

function createDevelopmentPlan({

    request,
    files = [],
    analysis = ""

}) {

    const cleanRequest =
        normalizeRequest(request);


    if (!cleanRequest) {

        throw new Error(
            "Development request is empty."
        );

    }


    const planId =
        "DEV-" +
        Date.now();


    return {

        id:
            planId,

        version:
            DEVELOPMENT_VERSION,

        status:
            "WAITING_FOR_APPROVAL",

        request:
            cleanRequest,

        analysis:
            analysis || "AyAI will analyze the requested improvement.",

        files:

            Array.isArray(files)
                ? files
                : [],

        changes: [],

        risks: [],

        requiresApproval:
            true,

        approved:
            false,

        createdAt:
            new Date().toISOString()

    };

}


/*
====================================================
 ADD CHANGE
====================================================

تضيف تغيير مقترح للخطة فقط.
====================================================
*/

function addChange(
    plan,
    {
        path,
        action,
        description,
        reason,
        oldContent = null,
        newContent = null
    }
) {

    if (!plan) {

        throw new Error(
            "Development plan not found."
        );

    }


    if (
        plan.status !==
        "WAITING_FOR_APPROVAL"
    ) {

        throw new Error(
            "Development plan is not editable."
        );

    }


    if (!path) {

        throw new Error(
            "Missing file path."
        );

    }


    const allowed =
        isAllowedPath(path);


    if (!allowed) {

        throw new Error(
            `File "${path}" is not allowed.`
        );

    }


    plan.changes.push({

        path,

        action:
            action || "modify",

        description:
            description || "",

        reason:
            reason || "",

        oldContent,

        newContent

    });


    return plan;

}


/*
====================================================
 ADD RISK
====================================================
*/

function addRisk(
    plan,
    risk
) {

    if (!plan) {

        throw new Error(
            "Development plan not found."
        );

    }


    if (!risk) {

        return plan;

    }


    plan.risks.push(
        String(risk).slice(0, 1000)
    );


    return plan;

}


/*
====================================================
 CHECK ALLOWED PATH
====================================================
*/

function isAllowedPath(
    filePath,
    allowedPaths =
        DEFAULT_ALLOWED_PATHS
) {

    if (!filePath) {

        return false;

    }


    const normalized =
        filePath
            .replace(/^\/+/, "")
            .trim();


    return allowedPaths.some(
        rule => {

            const cleanRule =
                rule
                    .replace(/^\/+/, "")
                    .trim();


            if (
                cleanRule.endsWith("/")
            ) {

                return normalized
                    .startsWith(cleanRule);

            }


            return normalized === cleanRule;

        }
    );

}


/*
====================================================
 VALIDATE PLAN
====================================================

قبل السماح بالموافقة.
====================================================
*/

function validatePlan(plan) {

    const errors = [];


    if (!plan) {

        errors.push(
            "Plan is missing."
        );

        return {
            valid: false,
            errors
        };

    }


    if (!plan.id) {

        errors.push(
            "Plan ID is missing."
        );

    }


    if (!plan.request) {

        errors.push(
            "Original request is missing."
        );

    }


    if (
        !Array.isArray(plan.changes)
    ) {

        errors.push(
            "Changes list is invalid."
        );

    }


    if (
        Array.isArray(plan.changes)
    ) {

        for (
            const change
            of plan.changes
        ) {

            if (!change.path) {

                errors.push(
                    "A change has no file path."
                );

                continue;

            }


            if (
                !isAllowedPath(
                    change.path
                )
            ) {

                errors.push(
                    `Unauthorized path: ${change.path}`
                );

            }


            if (
                change.action === "modify" &&
                typeof change.newContent !==
                "string"
            ) {

                errors.push(
                    `Missing new content for ${change.path}`
                );

            }

        }

    }


    return {

        valid:
            errors.length === 0,

        errors

    };

}


/*
====================================================
 APPROVE PLAN
====================================================

مهم جداً:

هذه الوظيفة لا تكتب إلى GitHub.

فقط تحول حالة الخطة إلى APPROVED.

عملية الكتابة تبقى في api/develop.js
====================================================
*/

function approvePlan(
    plan,
    approvalToken
) {

    if (!plan) {

        throw new Error(
            "Development plan not found."
        );

    }


    if (
        !approvalToken
    ) {

        throw new Error(
            "Explicit approval token required."
        );

    }


    const validation =
        validatePlan(plan);


    if (
        !validation.valid
    ) {

        throw new Error(
            validation.errors.join("\n")
        );

    }


    plan.approved =
        true;


    plan.status =
        "APPROVED";


    plan.approvedAt =
        new Date().toISOString();


    return plan;

}


/*
====================================================
 REJECT PLAN
====================================================
*/

function rejectPlan(plan) {

    if (!plan) {

        throw new Error(
            "Development plan not found."
        );

    }


    plan.approved =
        false;


    plan.status =
        "REJECTED";


    plan.rejectedAt =
        new Date().toISOString();


    return plan;

}


/*
====================================================
 PREPARE EXECUTION
====================================================

تحضير الملفات التي يسمح لـ develop.js
بكتابتها.

لا يتم تنفيذ أي شيء هنا.
====================================================
*/

function prepareExecution(
    plan
) {

    if (!plan) {

        throw new Error(
            "Development plan not found."
        );

    }


    if (
        plan.status !==
        "APPROVED"
    ) {

        throw new Error(
            "Development plan has not been approved."
        );

    }


    if (
        plan.approved !== true
    ) {

        throw new Error(
            "Explicit approval is required."
        );

    }


    const validation =
        validatePlan(plan);


    if (
        !validation.valid
    ) {

        throw new Error(
            validation.errors.join("\n")
        );

    }


    return {

        planId:
            plan.id,

        approved:
            true,

        changes:
            plan.changes.map(
                change => ({

                    path:
                        change.path,

                    action:
                        change.action,

                    content:
                        change.newContent

                })
            )

    };

}


/*
====================================================
 DEVELOPMENT SUMMARY
====================================================

هذا النص هو الذي يمكن عرضه للمستخدم
قبل زر APPROVE.
====================================================
*/

function getApprovalSummary(
    plan
) {

    if (!plan) {

        return {

            title:
                "No development plan",

            message:
                "لا توجد خطة تطوير."

        };

    }


    const changes =
        plan.changes || [];


    const files =
        changes.map(
            change =>
                change.path
        );


    return {

        id:
            plan.id,

        status:
            plan.status,

        title:
            "AyAI Development Proposal",

        request:
            plan.request,

        analysis:
            plan.analysis,

        files,

        changes:
            changes.map(
                change => ({

                    file:
                        change.path,

                    action:
                        change.action,

                    description:
                        change.description,

                    reason:
                        change.reason

                })
            ),

        risks:
            plan.risks || [],

        requiresApproval:
            true,

        approvalMessage:
            "لن يتم تعديل أي ملف قبل موافقة المستخدم."

    };

}


/*
====================================================
 EXPORT
====================================================
*/

export {

    DEVELOPMENT_VERSION,

    normalizeRequest,

    createDevelopmentPlan,

    addChange,

    addRisk,

    validatePlan,

    approvePlan,

    rejectPlan,

    prepareExecution,

    getApprovalSummary,

    isAllowedPath

};
