/*
====================================================
              AyAI DEVELOPMENT CORE
====================================================

Vercel Environment Variables:

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


  if (req.method !== "POST") {

    return res.status(405).json({

      error:
        "Only POST requests are allowed"

    });

  }


  try {


    const {

      action,

      path,

      content,

      message,

      approved

    } = req.body || {};


    /*
    =================================================
    EXPLICIT APPROVAL
    =================================================
    */

    if (approved !== true) {

      return res.status(403).json({

        error:
          "Development requires explicit approval."

      });

    }


    /*
    =================================================
    ENVIRONMENT
    =================================================
    */

    const TOKEN =
      process.env.GITHUB_TOKEN;

    const OWNER =
      process.env.GITHUB_OWNER;

    const REPO =
      process.env.GITHUB_REPO;

    const BRANCH =
      process.env.GITHUB_BRANCH ||
      "main";


    if (
      !TOKEN ||
      !OWNER ||
      !REPO
    ) {

      return res.status(500).json({

        error:
          "GitHub environment variables are not configured."

      });

    }


    /*
    =================================================
    ALLOWED FILES
    =================================================
    */

    const allowedRaw =
      process.env.AYAI_ALLOWED_PATHS ||
      "index.html,brain/,api/";


    const allowed =
      allowedRaw
        .split(",")
        .map(
          x => x.trim()
        )
        .filter(Boolean);


    function isAllowed(filePath) {


      if (
        !filePath ||
        filePath.includes("..") ||
        filePath.startsWith("/")
      ) {

        return false;

      }


      return allowed.some(
        rule => {

          if (
            rule.endsWith("/")
          ) {

            return filePath.startsWith(
              rule
            );

          }


          return filePath === rule;

        }
      );

    }


    /*
    =================================================
    GITHUB API
    =================================================
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


    /*
    =================================================
    READ FILE
    =================================================
    */

    if (
      action === "read"
    ) {


      if (!path) {

        return res.status(400).json({

          error:
            "Missing file path."

        });

      }


      if (!isAllowed(path)) {

        return res.status(403).json({

          error:
            "This file is not allowed."

        });

      }


      const url =
        base +
        path
          .split("/")
          .map(
            encodeURIComponent
          )
          .join("/");


      const response =
        await fetch(

          `${url}?ref=${encodeURIComponent(
            BRANCH
          )}`,

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


      if (
        data.encoding ===
        "base64"
      ) {

        decoded =
          Buffer
            .from(
              data.content
                .replace(/\n/g, ""),
              "base64"
            )
            .toString("utf8");

      }


      return res.status(200).json({

        success: true,

        path:
          data.path,

        sha:
          data.sha,

        content:
          decoded

      });

    }


    /*
    =================================================
    WRITE FILE
    =================================================
    */

    if (
      action === "write"
    ) {


      if (!path) {

        return res.status(400).json({

          error:
            "Missing file path."

        });

      }


      if (!isAllowed(path)) {

        return res.status(403).json({

          error:
            "This file is not allowed to be modified."

        });

      }


      if (
        typeof content !==
        "string"
      ) {

        return res.status(400).json({

          error:
            "Missing file content."

        });

      }


      /*
      ---------------------------------------------
      GitHub URL
      ---------------------------------------------
      */

      const url =
        base +
        path
          .split("/")
          .map(
            encodeURIComponent
          )
          .join("/");


      /*
      ---------------------------------------------
      READ CURRENT FILE
      ---------------------------------------------
      */

      const currentResponse =
        await fetch(

          `${url}?ref=${encodeURIComponent(
            BRANCH
          )}`,

          {

            method: "GET",

            headers

          }

        );


      let current =
        null;


      if (
        currentResponse.ok
      ) {

        current =
          await currentResponse.json();

      }


      /*
      ---------------------------------------------
      ENCODE
      ---------------------------------------------
      */

      const encoded =
        Buffer
          .from(
            content,
            "utf8"
          )
          .toString("base64");


      const payload = {

        message:
          message ||
          `AyAI development: update ${path}`,

        content:
          encoded,

        branch:
          BRANCH

      };


      /*
      ---------------------------------------------
      SHA
      ---------------------------------------------
      */

      if (
        current &&
        current.sha
      ) {

        payload.sha =
          current.sha;

      }


      /*
      ---------------------------------------------
      WRITE
      ---------------------------------------------
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

        return res.status(
          response.status
        ).json({

          error:
            data.message ||
            "GitHub write failed."

        });

      }


      return res.status(200).json({

        success:
          true,

        path:
          path,

        commit:
          data.commit?.sha ||
          null,

        message:
          "Development applied successfully."

      });

    }


    /*
    =================================================
    PROPOSE
    =================================================

    هذا الجزء لا يكتب كود.
    فقط يستقبل طلب التطوير ويعيده
    حتى يبقى القرار النهائي للمستخدم.
    */

    if (
      action === "propose"
    ) {


      if (!message) {

        return res.status(400).json({

          error:
            "Missing development request."

        });

      }


      return res.status(200).json({

        success:
          true,

        plan:
          `Development request received:

${message}

The request has been approved for the development pipeline.

No file was modified by this action.

To modify a file, the frontend must explicitly send:

action = "write"

with:

approved = true

and a specific allowed file path.`

      });

    }


    /*
    =================================================
    UNKNOWN
    =================================================
    */

    return res.status(400).json({

      error:
        "Unknown development action."

    });


  } catch (error) {


    console.error(
      "AyAI Development Error:",
      error
    );


    return res.status(500).json({

      error:
        error.message ||
        "Development server error."

    });

  }

}
