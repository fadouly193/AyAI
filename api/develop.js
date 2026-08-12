import crypto from "crypto";


/*
====================================================
                AyAI DEVELOPMENT API
====================================================

ACTIONS:

propose
    إنشاء خطة تطوير بدون تعديل أي ملف.

approve
    تنفيذ التعديل بعد موافقة المستخدم.

read
    قراءة ملف مسموح.

write
    كتابة ملف، ولكن فقط داخلياً بعد Proposal Token.

====================================================

ENV:

GITHUB_TOKEN
GITHUB_OWNER
GITHUB_REPO
GITHUB_BRANCH

AYAI_ALLOWED_PATHS

مثال:

index.html,api/,brain/

====================================================
*/


const PROPOSAL_TTL =
    10 * 60 * 1000;


/*
====================================================
                HELPERS
====================================================
*/

function json(res,status,data){

    return res
        .status(status)
        .json(data);

}


function getAllowedPaths(){

    const raw =
        process.env.AYAI_ALLOWED_PATHS ||
        "index.html,api/,brain/";

    return raw
        .split(",")
        .map(x => x.trim())
        .filter(Boolean);

}


function normalizePath(path){

    return String(path || "")
        .replace(/^\/+/,"")
        .replace(/\\/g,"/");
}


function isAllowed(path){

    const filePath =
        normalizePath(path);

    const allowed =
        getAllowedPaths();

    return allowed.some(rule => {

        if(rule.endsWith("/")){

            return filePath.startsWith(rule);

        }

        return filePath === rule;

    });

}


/*
====================================================
                PROPOSAL SIGNATURE
====================================================
*/

function getSecret(){

    const secret =
        process.env.AYAI_DEV_SECRET;

    if(!secret){

        throw new Error(
            "AYAI_DEV_SECRET is missing"
        );

    }

    return secret;

}


function createProposalToken(payload){

    const secret =
        getSecret();

    const body =
        Buffer
            .from(
                JSON.stringify(payload)
            )
            .toString("base64url");

    const signature =
        crypto
            .createHmac(
                "sha256",
                secret
            )
            .update(body)
            .digest("base64url");

    return `${body}.${signature}`;

}


function verifyProposalToken(token){

    if(!token){

        return null;

    }

    const parts =
        String(token).split(".");

    if(parts.length !== 2){

        return null;

    }

    const body =
        parts[0];

    const signature =
        parts[1];

    const expected =
        crypto
            .createHmac(
                "sha256",
                getSecret()
            )
            .update(body)
            .digest("base64url");

    if(
        signature.length !==
        expected.length
    ){

        return null;

    }

    if(
        !crypto.timingSafeEqual(
            Buffer.from(signature),
            Buffer.from(expected)
        )
    ){

        return null;

    }

    try{

        const payload =
            JSON.parse(
                Buffer
                    .from(
                        body,
                        "base64url"
                    )
                    .toString("utf8")
            );

        if(
            !payload.createdAt ||
            Date.now() -
                payload.createdAt >
                PROPOSAL_TTL
        ){

            return null;

        }

        return payload;

    }catch(e){

        return null;

    }

}


/*
====================================================
                GITHUB CONFIG
====================================================
*/

function githubConfig(){

    const TOKEN =
        process.env.GITHUB_TOKEN;

    const OWNER =
        process.env.GITHUB_OWNER;

    const REPO =
        process.env.GITHUB_REPO;

    const BRANCH =
        process.env.GITHUB_BRANCH ||
        "main";


    if(
        !TOKEN ||
        !OWNER ||
        !REPO
    ){

        throw new Error(
            "GitHub environment variables are not configured."
        );

    }


    return {
        TOKEN,
        OWNER,
        REPO,
        BRANCH
    };

}


/*
====================================================
                GITHUB URL
====================================================
*/

function githubFileUrl(
    OWNER,
    REPO,
    path
){

    return (
        `https://api.github.com/repos/` +
        `${encodeURIComponent(OWNER)}/` +
        `${encodeURIComponent(REPO)}/contents/` +
        normalizePath(path)
            .split("/")
            .map(encodeURIComponent)
            .join("/")
    );

}


/*
====================================================
                GITHUB HEADERS
====================================================
*/

function githubHeaders(TOKEN){

    return {

        "Accept":
            "application/vnd.github+json",

        "Authorization":
            `Bearer ${TOKEN}`,

        "X-GitHub-Api-Version":
            "2026-03-10",

        "Content-Type":
            "application/json"

    };

}


/*
====================================================
                READ GITHUB FILE
====================================================
*/

async function readGithubFile(
    path
){

    const {
        TOKEN,
        OWNER,
        REPO,
        BRANCH
    } = githubConfig();


    const url =
        githubFileUrl(
            OWNER,
            REPO,
            path
        );


    const response =
        await fetch(
            `${url}?ref=${encodeURIComponent(BRANCH)}`,
            {
                method:"GET",
                headers:
                    githubHeaders(TOKEN)
            }
        );


    const data =
        await response.json();


    if(!response.ok){

        throw new Error(
            data.message ||
            "GitHub read failed."
        );

    }


    let content="";


    if(
        data.encoding ===
        "base64"
    ){

        content =
            Buffer
                .from(
                    data.content
                        .replace(/\n/g,""),
                    "base64"
                )
                .toString("utf8");

    }


    return {

        path:data.path,

        sha:data.sha,

        content

    };

}


/*
====================================================
                WRITE GITHUB FILE
====================================================
*/

async function writeGithubFile(
    path,
    content,
    commitMessage
){

    const {
        TOKEN,
        OWNER,
        REPO,
        BRANCH
    } = githubConfig();


    const url =
        githubFileUrl(
            OWNER,
            REPO,
            path
        );


    let current=null;


    const currentResponse =
        await fetch(
            `${url}?ref=${encodeURIComponent(BRANCH)}`,
            {
                method:"GET",
                headers:
                    githubHeaders(TOKEN)
            }
        );


    if(currentResponse.ok){

        current =
            await currentResponse.json();

    }


    const encoded =
        Buffer
            .from(
                content,
                "utf8"
            )
            .toString("base64");


    const payload={

        message:
            commitMessage ||
            `AyAI development: update ${path}`,

        content:
            encoded,

        branch:
            BRANCH

    };


    if(
        current &&
        current.sha
    ){

        payload.sha =
            current.sha;

    }


    const response =
        await fetch(
            url,
            {

                method:"PUT",

                headers:
                    githubHeaders(TOKEN),

                body:
                    JSON.stringify(
                        payload
                    )

            }
        );


    const data =
        await response.json();


    if(!response.ok){

        throw new Error(
            data.message ||
            "GitHub write failed."
        );

    }


    return data;

}


/*
====================================================
        DEVELOPMENT PLAN GENERATOR
====================================================

هنا حالياً نخلي AyAI يقترح خطة آمنة.

لاحقاً نقدر نخلي Groq نفسه يولد
patch/code changes بشكل منظم.

====================================================
*/

async function generateProposal(request){

    const text =
        String(request || "").trim();


    if(!text){

        throw new Error(
            "Development request is empty."
        );

    }


    /*
    -----------------------------------------------
    الملفات المسموح بها
    -----------------------------------------------
    */

    const allowed =
        getAllowedPaths();


    /*
    -----------------------------------------------
    نحدد الملفات المحتملة
    -----------------------------------------------
    */

    let files=[];


    if(
        /واجهة|تصميم|index|صفحه|صفحة|زر|زرار/i
            .test(text)
    ){

        if(
            isAllowed("index.html")
        ){

            files.push(
                "index.html"
            );

        }

    }


    if(
        /api|ذكاء|ذكاء اصطناعي|chat|groq/i
            .test(text)
    ){

        if(
            isAllowed("api/chat.js")
        ){

            files.push(
                "api/chat.js"
            );

        }

    }


    if(
        files.length===0
    ){

        files.push(
            allowed[0]
        );

    }


    /*
    -----------------------------------------------
    الخطة
    -----------------------------------------------
    */

    const plan =
`AyAI Development Proposal

طلب المستخدم:
${text}

الخطة المقترحة:

1. تحليل الطلب قبل التعديل.
2. تحديد الملفات التي تحتاج إلى تغيير.
3. الحفاظ على وظائف AyAI الحالية.
4. عدم تغيير مفاتيح API أو بيانات GitHub.
5. تنفيذ التعديل فقط بعد موافقة المستخدم.
6. إنشاء GitHub Commit للتغيير.
7. انتظار إعادة نشر Vercel.

ملاحظة:
هذه المرحلة Proposal فقط.
لم يتم تعديل أي ملف حتى الآن.`;


    const proposalPayload={

        createdAt:
            Date.now(),

        request:text,

        files,

        nonce:
            crypto
                .randomBytes(16)
                .toString("hex")

    };


    const approvalToken =
        createProposalToken(
            proposalPayload
        );


    const proposalId =
        crypto
            .createHash("sha256")
            .update(
                approvalToken
            )
            .digest("hex")
            .slice(0,16);


    return {

        proposalId,

        approvalToken,

        plan,

        files

    };

}


/*
====================================================
                HANDLER
====================================================
*/

export default async function handler(
    req,
    res
){

    if(
        req.method !==
        "POST"
    ){

        return json(
            res,
            405,
            {
                error:
                    "Only POST requests are allowed."
            }
        );

    }


    try{

        const body =
            req.body || {};


        const action =
            body.action;


        /*
        ============================================
                    PROPOSE
        ============================================
        */

        if(
            action ===
            "propose"
        ){

            const proposal =
                await generateProposal(
                    body.request
                );


            return json(
                res,
                200,
                {

                    success:true,

                    ...proposal

                }
            );

        }


        /*
        ============================================
                    READ
        ============================================
        */

        if(
            action ===
            "read"
        ){

            const path =
                normalizePath(
                    body.path
                );


            if(
                !isAllowed(path)
            ){

                return json(
                    res,
                    403,
                    {
                        error:
                            "This file is not allowed."
                    }
                );

            }


            const file =
                await readGithubFile(
                    path
                );


            return json(
                res,
                200,
                {

                    success:true,

                    ...file

                }
            );

        }


        /*
        ============================================
                    APPROVE
        ============================================
        */

        if(
            action ===
            "approve"
        ){

            const token =
                body.approvalToken;


            const proposal =
                verifyProposalToken(
                    token
                );


            if(!proposal){

                return json(
                    res,
                    403,
                    {
                        error:
                            "Invalid or expired development approval."
                    }
                );

            }


            /*
            ----------------------------------------
            IMPORTANT SECURITY CHECK
            ----------------------------------------
            */

            const files =
                Array.isArray(
                    proposal.files
                )
                ?
                proposal.files
                :
                [];


            if(
                files.length===0
            ){

                return json(
                    res,
                    400,
                    {
                        error:
                            "Proposal contains no files."
                    }
                );

            }


            /*
            ----------------------------------------
            حالياً التنفيذ الآمن يكون فقط للملفات
            التي تم تحديدها في Proposal.
            ----------------------------------------
            */

            const results=[];


            for(
                const path of files
            ){

                if(
                    !isAllowed(path)
                ){

                    throw new Error(
                        `File not allowed: ${path}`
                    );

                }


                /*
                ------------------------------------
                هنا نقرأ الملف.

                في هذه النسخة لا نكتب كود مولد
                عشوائياً من المتصفح.

                وهذا مقصود للحماية.
                ------------------------------------
                */

                const current =
                    await readGithubFile(
                        path
                    );


                results.push({

                    path,

                    sha:
                        current.sha,

                    status:
                        "approved-and-read"

                });

            }


            /*
            ----------------------------------------
            حالياً Approval يسجل الموافقة
            ويجهز الملفات.

            حتى لا نخلي AI يكتب كوداً عشوائياً
            في GitHub بدون Patch واضح.
            ----------------------------------------
            */


            return json(
                res,
                200,
                {

                    success:true,

                    message:
                        "Development approved. Files are ready for the next controlled patch step.",

                    proposalId:
                        body.proposalId ||
                        null,

                    results

                }
            );

        }


        /*
        ============================================
                    DIRECT WRITE
        ============================================
        */

        if(
            action ===
            "write"
        ){

            /*
            ----------------------------------------
            لا نسمح للواجهة باستعمال write مباشرة.
            ----------------------------------------
            */

            return json(
                res,
                403,
                {

                    error:
                        "Direct write is disabled. Use proposal -> approval workflow."

                }
            );

        }


        return json(
            res,
            400,
            {
                error:
                    "Unknown development action."
            }
        );


    }catch(error){

        console.error(
            "AyAI Development API:",
            error
        );


        return json(
            res,
            500,
            {

                error:
                    error.message ||
                    "Development server error."

            }
        );

    }

}
