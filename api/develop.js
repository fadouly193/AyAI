// api/develop.js

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed"
    });
  }

  try {
    const body = req.body || {};

    const action = body.action;
    const request = body.request || "";

    /*
      Supported actions:

      analyze
      approve
      apply
    */

    if (!action) {
      return res.status(400).json({
        ok: false,
        error: "Missing development action"
      });
    }

    // -----------------------------------------
    // ANALYZE
    // -----------------------------------------

    if (action === "analyze") {
      if (!request.trim()) {
        return res.status(400).json({
          ok: false,
          error: "Development request is empty"
        });
      }

      const plan = {
        title: "AyAI Development Plan",

        summary:
          "تحليل طلب التطوير قبل إجراء أي تعديل على المشروع.",

        request: request,

        changes: [
          "تحليل المطلوب وتحديد الملفات المتأثرة",
          "تحديد التغييرات المطلوبة بدون التأثير على الوظائف الحالية",
          "إنشاء خطة تطوير قابلة للمراجعة",
          "طلب موافقة المستخدم قبل التطبيق"
        ],

        files: [
          "index.html"
        ],

        risk: "منخفض",

        apply: false,

        status: "WAITING_FOR_APPROVAL"
      };

      return res.status(200).json({
        ok: true,
        action: "analyze",
        plan
      });
    }

    // -----------------------------------------
    // APPROVE
    // -----------------------------------------

    if (action === "approve") {
      return res.status(200).json({
        ok: true,
        action: "approve",
        message:
          "تمت الموافقة على خطة التطوير. أصبح التعديل جاهزاً للتطبيق.",
        status: "APPROVED"
      });
    }

    // -----------------------------------------
    // APPLY
    // -----------------------------------------

    if (action === "apply") {
      const plan = body.plan || {};

      if (!plan || !plan.request) {
        return res.status(400).json({
          ok: false,
          error: "Development plan is missing"
        });
      }

      /*
        IMPORTANT:

        هنا لا نقوم بتعديل GitHub مباشرة.

        هذا الجزء هو نقطة الأمان.
        لاحقاً نربطه مع GitHub API حتى يستطيع AyAI:

        1. قراءة الملفات
        2. تحليلها
        3. إنشاء التعديلات
        4. عرض Diff
        5. انتظار الموافقة
        6. Commit
        7. Push
      */

      return res.status(200).json({
        ok: true,
        action: "apply",
        status: "READY_TO_APPLY",

        message:
          "تمت الموافقة. الخطة جاهزة لمرحلة تطبيق التعديلات على GitHub.",

        files: plan.files || [],

        changes: plan.changes || []
      });
    }

    // -----------------------------------------
    // UNKNOWN ACTION
    // -----------------------------------------

    return res.status(400).json({
      ok: false,
      error: "Unknown development action",
      receivedAction: action,
      supportedActions: [
        "analyze",
        "approve",
        "apply"
      ]
    });

  } catch (error) {
    console.error("Development Core Error:", error);

    return res.status(500).json({
      ok: false,
      error: error.message || "Development Core failed"
    });
  }
}
