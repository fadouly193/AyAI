"use strict";

/*
====================================================
                    AyAI
             EVOLUTION ENGINE
====================================================

AyAI يستطيع:
- تحليل نفسه
- اقتراح تطويرات
- إنشاء Proposal
- انتظار موافقة المستخدم
- إرسال التطوير للـ Backend
- حفظ سجل التطويرات

مهم:
AyAI لا يعدل الكود من المتصفح مباشرة.
أي تعديل حقيقي يمر عبر /api/develop.js
وبعد موافقة المستخدم.
====================================================
*/

class AyAIEvolution {

    constructor() {

        this.historyKey =
            "ayai_evolution_history_v2";

        this.pendingProposal = null;

        this.history =
            this.loadHistory();

        this.status = "READY";
    }


    loadHistory() {

        try {

            const saved =
                localStorage.getItem(
                    this.historyKey
                );

            if (!saved) return [];

            const data =
                JSON.parse(saved);

            return Array.isArray(data)
                ? data.slice(-50)
                : [];

        } catch (error) {

            return [];

        }

    }


    saveHistory() {

        try {

            localStorage.setItem(
                this.historyKey,
                JSON.stringify(
                    this.history.slice(-50)
                )
            );

        } catch (error) {}

    }


    getStatus() {

        return {

            status:
                this.status,

            pending:
                this.pendingProposal,

            historyCount:
                this.history.length

        };

    }


    async analyze() {

        this.status =
            "ANALYZING";


        const proposals = [

            {
                id:
                    "memory-intelligence",

                title:
                    "تحسين الذاكرة الذكية",

                description:
                    "تحسين طريقة حفظ واسترجاع المعلومات المهمة من المحادثات.",

                impact:
                    "MEDIUM",

                risk:
                    "LOW"

            },


            {
                id:
                    "task-engine",

                title:
                    "محرك المهام",

                description:
                    "تقسيم المهام المعقدة إلى خطوات وتنفيذها بالتتابع.",

                impact:
                    "HIGH",

                risk:
                    "MEDIUM"

            },


            {
                id:
                    "voice-understanding",

                title:
                    "تحسين فهم الصوت",

                description:
                    "تحسين فهم الأوامر العربية واللهجة العراقية.",

                impact:
                    "HIGH",

                risk:
                    "LOW"

            },


            {
                id:
                    "computer-control",

                title:
                    "محرك تنفيذ الأوامر",

                description:
                    "إضافة بنية تسمح لـ AyAI بتنفيذ أوامر متعددة بعد موافقة المستخدم.",

                impact:
                    "HIGH",

                risk:
                    "HIGH"

            },


            {
                id:
                    "self-evolution",

                title:
                    "التطور الذاتي",

                description:
                    "تحليل ملفات المشروع واكتشاف فرص التطوير وإنشاء مقترحات للكود.",

                impact:
                    "VERY HIGH",

                risk:
                    "HIGH"

            }

        ];


        this.status =
            "READY";


        return {

            status:
                "ANALYSIS_COMPLETE",

            proposals:

                proposals,

            timestamp:
                new Date().toISOString()

        };

    }


    createProposal(
        proposal
    ) {

        if (!proposal) {

            throw new Error(
                "Invalid proposal"
            );

        }


        this.pendingProposal = {

            id:
                crypto.randomUUID(),

            proposalId:
                proposal.id,

            title:
                proposal.title,

            description:
                proposal.description,

            impact:
                proposal.impact,

            risk:
                proposal.risk,

            status:
                "WAITING_FOR_APPROVAL",

            createdAt:
                new Date().toISOString()

        };


        this.status =
            "WAITING_FOR_APPROVAL";


        return this.pendingProposal;

    }


    approve() {

        if (!this.pendingProposal) {

            return {

                success:
                    false,

                message:
                    "لا يوجد تطوير بانتظار الموافقة."

            };

        }


        this.pendingProposal.status =
            "APPROVED";


        this.pendingProposal.approvedAt =
            new Date().toISOString();


        this.status =
            "APPROVED";


        return {

            success:
                true,

            proposal:
                this.pendingProposal

        };

    }


    reject() {

        if (!this.pendingProposal) {

            return {

                success:
                    false

            };

        }


        const item = {

            ...this.pendingProposal,

            status:
                "REJECTED",

            rejectedAt:
                new Date().toISOString()

        };


        this.history.push(item);

        this.saveHistory();

        this.pendingProposal =
            null;

        this.status =
            "READY";


        return {

            success:
                true

        };

    }


    addHistory(item) {

        this.history.push({

            ...item,

            timestamp:
                new Date().toISOString()

        });


        this.history =
            this.history.slice(-50);

        this.saveHistory();

    }


    getHistory() {

        return [
            ...this.history
        ];

    }


    clearHistory() {

        this.history = [];

        try {

            localStorage.removeItem(
                this.historyKey
            );

        } catch (error) {}

    }

}


window.AyAIEvolution =
    AyAIEvolution;


window.ayaiEvolution =
    new AyAIEvolution();
