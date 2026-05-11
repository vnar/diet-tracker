"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.COACH_TONE_OPTIONS = void 0;
exports.normalizeCoachTone = normalizeCoachTone;
exports.parseCoachToneInput = parseCoachToneInput;
exports.applyCoachToneToAiNudge = applyCoachToneToAiNudge;
exports.applyCoachToneToAiNudges = applyCoachToneToAiNudges;
exports.applyCoachToneToInsight = applyCoachToneToInsight;
exports.weeklyEnergyCoachLine = weeklyEnergyCoachLine;
exports.COACH_TONE_OPTIONS = [
    { value: "friendly", label: "Friendly", hint: "Warm, conversational coaching." },
    { value: "clinical", label: "Clinical", hint: "Factual, concise; no hype." },
    {
        value: "tough-love",
        label: "Tough love",
        hint: "Direct and motivating — never shaming.",
    },
    {
        value: "ayurvedic",
        label: "Ayurvedic-inspired",
        hint: "Rhythm and balance language — not a medical or dosha diagnosis.",
    },
];
function normalizeCoachTone(value) {
    if (value === "clinical" || value === "tough-love" || value === "ayurvedic")
        return value;
    return "friendly";
}
/** Map product / snake_case aliases to stored API values. */
function parseCoachToneInput(raw) {
    if (!raw)
        return null;
    const v = raw.trim().toLowerCase().replace(/_/g, "-");
    if (v === "toughlove" || v === "tough-love")
        return "tough-love";
    if (v === "clinical")
        return "clinical";
    if (v === "ayurvedic")
        return "ayurvedic";
    if (v === "friendly")
        return "friendly";
    return null;
}
const PLATEAU = {
    friendly: {
        headline: "Your weight trend has been fairly steady lately.",
        detail: "Over the stretch we looked at, your rolling average barely shifted compared with earlier. That happens often while a body settles—it's a pattern in your logs, not a medical read. If you want to nudge things, small, sustainable tweaks beat big swings.",
        action: "Consider one gentle change this week—or keep your routine and check back after a few more logs.",
    },
    clinical: {
        headline: "Rolling average weight change is small versus the prior window.",
        detail: "Compared rolling averages from your logged morning weights, the difference falls below your configured movement threshold. This is a descriptive statistic from your entries, not a diagnosis.",
        action: "If desired, adjust one logged variable (intake, activity, or sleep) and reassess after additional data.",
    },
    "tough-love": {
        headline: "Flat isn't failure — it's information.",
        detail: "Your averages barely moved across the window we checked. That can mean consistency—or that one lever needs a deliberate tweak. Pick one change you can repeat for two weeks.",
        action: "Choose one lever (sleep, steps, or calories), adjust modestly, and log daily so the next read is cleaner.",
    },
    ayurvedic: {
        headline: "A steady chapter in your weight rhythm.",
        detail: "Your rolling averages stayed close together—like a calm season in the body rather than a sharp swing. Gentle, sustainable shifts still tend to land better than abrupt ones.",
        action: "Honor steady routines; if you seek movement, shift one habit with patience and keep logging.",
    },
};
const STREAK = {
    friendly: {
        headline: "", // filled with milestone
        detail: "Consistency is one of your strongest predictors of progress. Keep the streak alive tomorrow.",
        action: "Lock in tomorrow’s weigh-in to keep streak momentum.",
    },
    clinical: {
        headline: "",
        detail: "Consecutive-day logging improves signal quality for trend analysis. Continue daily entries when feasible.",
        action: "Maintain daily logging to preserve data continuity.",
    },
    "tough-love": {
        headline: "",
        detail: "Streaks are built in boring moments. Show up again tomorrow and the graph stays on your side.",
        action: "Log tomorrow before the day ends — protect the chain.",
    },
    ayurvedic: {
        headline: "",
        detail: "Daily logging creates a trustworthy rhythm—like steady beats in a practice. That continuity supports clearer self-awareness over time.",
        action: "Continue your gentle daily check-in with the scale when it fits your day.",
    },
};
const BASELINE = {
    friendly: {
        headline: "Great consistency so far — keep logging daily for sharper insights.",
        detail: "We need a bit more signal to detect strong personal patterns, but your data flow is active.",
        action: "Keep tracking daily habits and weight to unlock stronger personalized insights.",
    },
    clinical: {
        headline: "Insufficient signal for high-confidence personalized rules.",
        detail: "Current log volume or pattern diversity is below thresholds used for stronger inferences. Continue structured logging.",
        action: "Maintain daily entries across weight and key habit fields to improve model inputs.",
    },
    "tough-love": {
        headline: "Keep stacking logs — the coach gets smarter when you do.",
        detail: "Not enough pattern yet for bold callouts. That is normal early on. Consistency beats intensity here.",
        action: "Hit another week of daily logs, then revisit insights.",
    },
    ayurvedic: {
        headline: "Your practice is forming — a little more time will deepen the picture.",
        detail: "Patterns emerge as your logs accumulate. Steady, kind attention to the basics matters more than perfect weeks.",
        action: "Continue your daily rhythm of logging; insights will sharpen naturally.",
    },
};
const NUDGE_BY_CAT = {
    plateau: {
        friendly: {
            title: "Weight has been unusually flat",
            message: "Morning weight stayed within a tight band recently. That can happen during steady phases or when logging timing is very consistent.",
        },
        clinical: {
            title: "Plateau pattern in morning weights",
            message: "Recent morning weights show limited variation over the sampled window. This describes logged weights only, not a clinical plateau diagnosis.",
        },
        "tough-love": {
            title: "Your scale is whispering: hold steady",
            message: "Numbers barely budged — that can mean your routine is locked in. If you want more movement, pick one lever (sleep, steps, or calories) and adjust with intention, not guilt.",
        },
        ayurvedic: {
            title: "A steady season in your logs",
            message: "Your morning weights show a calm, stable rhythm lately — like a steady season rather than a sharp swing. Small, sustainable shifts still land better than abrupt ones.",
        },
    },
    weight_trend: {
        friendly: {
            title: "Recent week skews lighter",
            message: "Your average morning weight over the last 7 days is lower than the prior 7 — nice directional signal from your own logs.",
        },
        clinical: {
            title: "Seven-day mean weight decreased vs prior week",
            message: "Compared using only dated morning weights: the recent 7-day average is lower than the previous 7-day average.",
        },
        "tough-love": {
            title: "Down week — credit the work you already logged",
            message: "Seven-day average dipped versus the week before. That is momentum you earned in the data — keep showing up.",
        },
        ayurvedic: {
            title: "A lighter rhythm this week",
            message: "Your recent mornings lean a touch lighter than the week before — a gentle shift in the pattern your logs are drawing.",
        },
        weightTrendUp: {
            friendly: {
                title: "Recent week skews heavier",
                message: "Your average morning weight over the last 7 days is higher than the prior 7 — worth noticing as a pattern, not a verdict.",
            },
            clinical: {
                title: "Seven-day mean weight increased vs prior week",
                message: "Compared using only dated morning weights: the recent 7-day average is higher than the previous 7-day average.",
            },
            "tough-love": {
                title: "Up week — notice it, no spiral",
                message: "Seven-day average rose versus the week before. Treat it as signal from your logs, not a score on you — one steady week of basics can turn the curve.",
            },
            ayurvedic: {
                title: "A slightly heavier cadence this week",
                message: "Your logs show a modest upward shift week over week in morning weight — a pattern to observe with patience, not alarm.",
            },
        },
    },
    sleep_recovery: {
        friendly: {
            title: "Sleep looks a bit short in your logs",
            message: "Short sleep can line up with noisier hunger and energy — we are only describing what you logged, not diagnosing a condition.",
        },
        clinical: {
            title: "Below-average sleep duration in logs",
            message: "Mean self-reported sleep over the sampled window is under common healthy-sleep ranges. This reflects your entries only.",
        },
        "tough-love": {
            title: "Sleep is leaving money on the table",
            message: "Your logs show short nights stacking up. Protecting sleep is one of the highest-leverage habits for hunger and training — not a lecture, just the data you entered.",
        },
        ayurvedic: {
            title: "Evenings may be asking for more rest",
            message: "Your sleep entries suggest a shorter nightly rhythm lately. Honoring rest can support steadier energy and appetite — as reflected in your own logs.",
        },
        weightTrendUp: {
            friendly: {
                title: "Sleep is on the high side in your logs",
                message: "You logged more sleep than typical — could reflect recovery or different logging times.",
            },
            clinical: {
                title: "Above-average sleep duration in logs",
                message: "Mean self-reported sleep over the sampled window exceeds typical ranges. Interpretation depends on how and when you log.",
            },
            "tough-love": {
                title: "Big sleep numbers — use them if you trained hard",
                message: "You logged generous sleep. If training load was high, that can be appropriate; if not, check whether logging times shifted.",
            },
            ayurvedic: {
                title: "A spacious night rhythm in your entries",
                message: "Your logs show more sleep than usual — sometimes the body asks for extra recovery; sometimes logging shifts. Either way, it is your pattern to read gently.",
            },
        },
    },
    habit_pattern: {
        friendly: {
            title: "Late-snack pattern showing up",
            message: "You marked several late-snack evenings recently. If mornings feel harder on those days, consider a simple wind-down routine — still your choice.",
        },
        clinical: {
            title: "Frequent late-snack flags",
            message: "Multiple late-snack indicators in the recent window. This is derived from boolean flags you saved, not from meals or photos.",
        },
        "tough-love": {
            title: "Late snacks are showing up in the scoreboard",
            message: "You flagged late snacks often. If energy or hunger feels off, try moving calories earlier once or twice this week — small experiment, no shame.",
        },
        ayurvedic: {
            title: "Evening nourishment showing often in your flags",
            message: "Your logs note several late-snack evenings. If that rhythm feels heavy, a lighter, earlier evening pattern might balance your day — your call.",
        },
    },
    nutrition_pattern: {
        friendly: {
            title: "Calorie logging jumped between weeks",
            message: "Your average logged calories moved week-over-week. Big swings can make weight trends harder to read — not a judgment of “good” or “bad.”",
        },
        clinical: {
            title: "Material week-over-week change in mean logged calories",
            message: "Seven-day average calorie entries differ materially from the prior week. Uses daily entry calories when present.",
        },
        "tough-love": {
            title: "Calories swung hard week to week",
            message: "Your logged intake moved a lot between weeks. If the scale feels noisy, tightening consistency (even roughly) can make cause-and-effect easier to read.",
        },
        ayurvedic: {
            title: "Calorie rhythm shifted between weeks",
            message: "Your logged intake shows a noticeable swing week over week. Steadier fueling often reads as steadier signals on the scale — still your journey to pace.",
        },
    },
};
function weightTrendIsUp(nudge) {
    return (nudge.title.includes("heavier") ||
        nudge.message.includes("higher than the prior") ||
        nudge.message.includes("higher than the prior 7"));
}
function sleepIsHigh(nudge) {
    return nudge.title.includes("high side") || nudge.message.includes("more sleep than typical");
}
const GOAL_TITLES = {
    friendly: "Goal progress from your start weight",
    clinical: "Progress toward logged goal weight",
    "tough-love": "Goal distance — you have chipped away at it",
    ayurvedic: "Movement along the goal path you set",
};
function applyCoachToneToAiNudge(nudge, tone) {
    const t = normalizeCoachTone(tone);
    if (t === "friendly")
        return nudge;
    /** Goal nudge message includes computed % — never replace body copy. */
    if (nudge.category === "goal_progress") {
        return { ...nudge, title: GOAL_TITLES[t] ?? nudge.title };
    }
    let row;
    const cat = nudge.category;
    const block = NUDGE_BY_CAT[cat];
    if (!block)
        return nudge;
    if (cat === "weight_trend" && weightTrendIsUp(nudge)) {
        row = block.weightTrendUp?.[t];
    }
    else if (cat === "sleep_recovery" && sleepIsHigh(nudge)) {
        row = block.weightTrendUp?.[t];
    }
    else {
        row = block[t];
    }
    if (!row)
        return nudge;
    return {
        ...nudge,
        title: row.title,
        message: row.message,
    };
}
function applyCoachToneToAiNudges(nudges, tone) {
    const t = normalizeCoachTone(tone);
    return nudges.map((n) => applyCoachToneToAiNudge(n, t));
}
function streakMilestoneFromInsight(ins) {
    const m = ins.id.match(/^streak-(\d+)-/);
    if (m)
        return Number(m[1]);
    const line = ins.why.find((w) => w.includes("Milestone reached:"));
    if (line) {
        const mm = line.match(/(\d+)\s*days/);
        if (mm)
            return Number(mm[1]);
    }
    return null;
}
function applyCoachToneToInsight(ins, tone) {
    const t = normalizeCoachTone(tone);
    if (t === "friendly")
        return ins;
    if (ins.category === "plateau") {
        const p = PLATEAU[t];
        return { ...ins, headline: p.headline, detail: p.detail, action: p.action, why: ins.why };
    }
    if (ins.category === "streak") {
        const m = streakMilestoneFromInsight(ins) ?? 7;
        const s = STREAK[t];
        const headline = t === "clinical"
            ? `${m}-day consecutive logging streak.`
            : t === "tough-love"
                ? `${m}-day streak — keep the chain.`
                : t === "ayurvedic"
                    ? `${m} days of steady logging — a grounded rhythm.`
                    : `${m}-day logging streak. Nice work.`;
        return {
            ...ins,
            headline,
            detail: s.detail,
            action: s.action,
            why: ins.why,
        };
    }
    if (ins.ruleId === "baseline") {
        const b = BASELINE[t];
        return { ...ins, headline: b.headline, detail: b.detail, action: b.action, why: ins.why };
    }
    return ins;
}
function weeklyEnergyCoachLine(trend, avgNetKcal, tone) {
    const t = normalizeCoachTone(tone);
    const net = Math.round(avgNetKcal);
    const base = `Trailing 7-day average net energy (logged intake minus estimated burn) is about ${net} kcal/day; trend class: ${trend}.`;
    if (t === "clinical")
        return base;
    if (trend === "deficit") {
        if (t === "friendly")
            return `Your last week averaged about ${net} kcal/day below estimated burn — a deficit pattern in your logs. Keep fueling enough for training and recovery.`;
        if (t === "tough-love")
            return `Last week you averaged roughly ${net} kcal/day under burn — that is real deficit territory in the data. Make sure strength and sleep stay protected while you run it.`;
        return `Your week leaned into a gentle deficit rhythm (~${net} kcal/day net). Steady nourishment and rest still matter alongside the trend your entries show.`;
    }
    if (trend === "surplus") {
        if (t === "friendly")
            return `Your last week averaged about ${net} kcal/day above estimated burn — a surplus pattern in your logs.`;
        if (t === "tough-love")
            return `Roughly ${net} kcal/day over burn last week — call it what it is in the numbers, then decide if that matches your intent.`;
        return `The past week shows a surplus cadence (~${net} kcal/day net). If that aligns with your goals, fine; if not, small pacing shifts can rebalance.`;
    }
    if (t === "friendly")
        return `Net energy last week hovered near balance (~${net} kcal/day vs burn estimates) — maintenance-ish in your logs.`;
    if (t === "tough-love")
        return `You basically ran even last week (~${net} kcal/day net). Maintenance is a valid target — just name it so expectations match the scale.`;
    return `Your week sat near equilibrium (~${net} kcal/day net) — a balanced rhythm in the entries you saved.`;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29hY2hUb25lLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiY29hY2hUb25lLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQTBCQSxnREFHQztBQUdELGtEQVFDO0FBdVFELDBEQTRCQztBQUVELDREQUdDO0FBYUQsMERBbUNDO0FBRUQsc0RBOEJDO0FBclpZLFFBQUEsa0JBQWtCLEdBQXdEO0lBQ3JGLEVBQUUsS0FBSyxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUUsVUFBVSxFQUFFLElBQUksRUFBRSxnQ0FBZ0MsRUFBRTtJQUNoRixFQUFFLEtBQUssRUFBRSxVQUFVLEVBQUUsS0FBSyxFQUFFLFVBQVUsRUFBRSxJQUFJLEVBQUUsNEJBQTRCLEVBQUU7SUFDNUU7UUFDRSxLQUFLLEVBQUUsWUFBWTtRQUNuQixLQUFLLEVBQUUsWUFBWTtRQUNuQixJQUFJLEVBQUUsd0NBQXdDO0tBQy9DO0lBQ0Q7UUFDRSxLQUFLLEVBQUUsV0FBVztRQUNsQixLQUFLLEVBQUUsb0JBQW9CO1FBQzNCLElBQUksRUFBRSxpRUFBaUU7S0FDeEU7Q0FDRixDQUFDO0FBRUYsU0FBZ0Isa0JBQWtCLENBQUMsS0FBeUI7SUFDMUQsSUFBSSxLQUFLLEtBQUssVUFBVSxJQUFJLEtBQUssS0FBSyxZQUFZLElBQUksS0FBSyxLQUFLLFdBQVc7UUFBRSxPQUFPLEtBQUssQ0FBQztJQUMxRixPQUFPLFVBQVUsQ0FBQztBQUNwQixDQUFDO0FBRUQsNkRBQTZEO0FBQzdELFNBQWdCLG1CQUFtQixDQUFDLEdBQXVCO0lBQ3pELElBQUksQ0FBQyxHQUFHO1FBQUUsT0FBTyxJQUFJLENBQUM7SUFDdEIsTUFBTSxDQUFDLEdBQUcsR0FBRyxDQUFDLElBQUksRUFBRSxDQUFDLFdBQVcsRUFBRSxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFDdEQsSUFBSSxDQUFDLEtBQUssV0FBVyxJQUFJLENBQUMsS0FBSyxZQUFZO1FBQUUsT0FBTyxZQUFZLENBQUM7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O1lBQ3BCLE9BQU8sV0FBVyxHQUFHLDZHQUE2RyxDQUFDO1FBQ3JJLE9BQU8sMkNBQTJDLEdBQUcsa0dBQWtHLENBQUM7SUFDMUosQ0FBQztJQUNELElBQUksQ0FBQyxLQUFLLFVBQVU7UUFDbEIsT0FBTywrQ0FBK0MsR0FBRyw4REFBOEQsQ0FBQztJQUMxSCxJQUFJLENBQUMsS0FBSyxZQUFZO1FBQ3BCLE9BQU8sc0NBQXNDLEdBQUcsK0ZBQStGLENBQUM7SUFDbEosT0FBTyxvQ0FBb0MsR0FBRyw4REFBOEQsQ0FBQztBQUMvRyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBDb2FjaCBjb21tdW5pY2F0aW9uIHRvbmUg4oCUIHRlbXBsYXRlcyB3aGVuIExMTSBpcyBvZmYuIEZhY3R1YWwgbGluZXMgc3RheSBpblxuICogYHdoeWAgLyBgc3VwcG9ydGluZ0V2aWRlbmNlYDsgd2Ugb25seSByZXN0eWxlIHRpdGxlL21lc3NhZ2UgKGFuZCBpbnNpZ2h0IGFjdGlvbiB3aGVyZSBub3RlZCkuXG4gKlxuICogQVBJICsgRHluYW1vREIgZmllbGQ6IGB0b25lYCDigJQgZnJpZW5kbHkgfCBjbGluaWNhbCB8IHRvdWdoLWxvdmUgfCBheXVydmVkaWMuXG4gKi9cbmltcG9ydCB0eXBlIHsgQWlOdWRnZSwgQWlOdWRnZUNhdGVnb3J5IH0gZnJvbSBcIkAvbGliL2FpTnVkZ2VzL3R5cGVzXCI7XG5pbXBvcnQgdHlwZSB7IEluc2lnaHQsIEluc2lnaHRUb25lIH0gZnJvbSBcIkAvbGliL2luc2lnaHRzL3R5cGVzXCI7XG5cbmV4cG9ydCB0eXBlIENvYWNoVG9uZSA9IEluc2lnaHRUb25lO1xuXG5leHBvcnQgY29uc3QgQ09BQ0hfVE9ORV9PUFRJT05TOiB7IHZhbHVlOiBDb2FjaFRvbmU7IGxhYmVsOiBzdHJpbmc7IGhpbnQ6IHN0cmluZyB9W10gPSBbXG4gIHsgdmFsdWU6IFwiZnJpZW5kbHlcIiwgbGFiZWw6IFwiRnJpZW5kbHlcIiwgaGludDogXCJXYXJtLCBjb252ZXJzYXRpb25hbCBjb2FjaGluZy5cIiB9LFxuICB7IHZhbHVlOiBcImNsaW5pY2FsXCIsIGxhYmVsOiBcIkNsaW5pY2FsXCIsIGhpbnQ6IFwiRmFjdHVhbCwgY29uY2lzZTsgbm8gaHlwZS5cIiB9LFxuICB7XG4gICAgdmFsdWU6IFwidG91Z2gtbG92ZVwiLFxuICAgIGxhYmVsOiBcIlRvdWdoIGxvdmVcIixcbiAgICBoaW50OiBcIkRpcmVjdCBhbmQgbW90aXZhdGluZyDigJQgbmV2ZXIgc2hhbWluZy5cIixcbiAgfSxcbiAge1xuICAgIHZhbHVlOiBcImF5dXJ2ZWRpY1wiLFxuICAgIGxhYmVsOiBcIkF5dXJ2ZWRpYy1pbnNwaXJlZFwiLFxuICAgIGhpbnQ6IFwiUmh5dGhtIGFuZCBiYWxhbmNlIGxhbmd1YWdlIOKAlCBub3QgYSBtZWRpY2FsIG9yIGRvc2hhIGRpYWdub3Npcy5cIixcbiAgfSxcbl07XG5cbmV4cG9ydCBmdW5jdGlvbiBub3JtYWxpemVDb2FjaFRvbmUodmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZCk6IENvYWNoVG9uZSB7XG4gIGlmICh2YWx1ZSA9PT0gXCJjbGluaWNhbFwiIHx8IHZhbHVlID09PSBcInRvdWdoLWxvdmVcIiB8fCB2YWx1ZSA9PT0gXCJheXVydmVkaWNcIikgcmV0dXJuIHZhbHVlO1xuICByZXR1cm4gXCJmcmllbmRseVwiO1xufVxuXG4vKiogTWFwIHByb2R1Y3QgLyBzbmFrZV9jYXNlIGFsaWFzZXMgdG8gc3RvcmVkIEFQSSB2YWx1ZXMuICovXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VDb2FjaFRvbmVJbnB1dChyYXc6IHN0cmluZyB8IHVuZGVmaW5lZCk6IENvYWNoVG9uZSB8IG51bGwge1xuICBpZiAoIXJhdykgcmV0dXJuIG51bGw7XG4gIGNvbnN0IHYgPSByYXcudHJpbSgpLnRvTG93ZXJDYXNlKCkucmVwbGFjZSgvXy9nLCBcIi1cIik7XG4gIGlmICh2ID09PSBcInRvdWdobG92ZVwiIHx8IHYgPT09IFwidG91Z2gtbG92ZVwiKSByZXR1cm4gXCJ0b3VnaC1sb3ZlXCI7XG4gIGlmICh2ID09PSBcImNsaW5pY2FsXCIpIHJldHVybiBcImNsaW5pY2FsXCI7XG4gIGlmICh2ID09PSBcImF5dXJ2ZWRpY1wiKSByZXR1cm4gXCJheXVydmVkaWNcIjtcbiAgaWYgKHYgPT09IFwiZnJpZW5kbHlcIikgcmV0dXJuIFwiZnJpZW5kbHlcIjtcbiAgcmV0dXJuIG51bGw7XG59XG5cbnR5cGUgUm93ID0geyB0aXRsZTogc3RyaW5nOyBtZXNzYWdlOiBzdHJpbmcgfTtcblxuY29uc3QgUExBVEVBVTogUmVjb3JkPENvYWNoVG9uZSwgeyBoZWFkbGluZTogc3RyaW5nOyBkZXRhaWw6IHN0cmluZzsgYWN0aW9uOiBzdHJpbmcgfT4gPSB7XG4gIGZyaWVuZGx5OiB7XG4gICAgaGVhZGxpbmU6IFwiWW91ciB3ZWlnaHQgdHJlbmQgaGFzIGJlZW4gZmFpcmx5IHN0ZWFkeSBsYXRlbHkuXCIsXG4gICAgZGV0YWlsOlxuICAgICAgXCJPdmVyIHRoZSBzdHJldGNoIHdlIGxvb2tlZCBhdCwgeW91ciByb2xsaW5nIGF2ZXJhZ2UgYmFyZWx5IHNoaWZ0ZWQgY29tcGFyZWQgd2l0aCBlYXJsaWVyLiBUaGF0IGhhcHBlbnMgb2Z0ZW4gd2hpbGUgYSBib2R5IHNldHRsZXPigJRpdCdzIGEgcGF0dGVybiBpbiB5b3VyIGxvZ3MsIG5vdCBhIG1lZGljYWwgcmVhZC4gSWYgeW91IHdhbnQgdG8gbnVkZ2UgdGhpbmdzLCBzbWFsbCwgc3VzdGFpbmFibGUgdHdlYWtzIGJlYXQgYmlnIHN3aW5ncy5cIixcbiAgICBhY3Rpb246IFwiQ29uc2lkZXIgb25lIGdlbnRsZSBjaGFuZ2UgdGhpcyB3ZWVr4oCUb3Iga2VlcCB5b3VyIHJvdXRpbmUgYW5kIGNoZWNrIGJhY2sgYWZ0ZXIgYSBmZXcgbW9yZSBsb2dzLlwiLFxuICB9LFxuICBjbGluaWNhbDoge1xuICAgIGhlYWRsaW5lOiBcIlJvbGxpbmcgYXZlcmFnZSB3ZWlnaHQgY2hhbmdlIGlzIHNtYWxsIHZlcnN1cyB0aGUgcHJpb3Igd2luZG93LlwiLFxuICAgIGRldGFpbDpcbiAgICAgIFwiQ29tcGFyZWQgcm9sbGluZyBhdmVyYWdlcyBmcm9tIHlvdXIgbG9nZ2VkIG1vcm5pbmcgd2VpZ2h0cywgdGhlIGRpZmZlcmVuY2UgZmFsbHMgYmVsb3cgeW91ciBjb25maWd1cmVkIG1vdmVtZW50IHRocmVzaG9sZC4gVGhpcyBpcyBhIGRlc2NyaXB0aXZlIHN0YXRpc3RpYyBmcm9tIHlvdXIgZW50cmllcywgbm90IGEgZGlhZ25vc2lzLlwiLFxuICAgIGFjdGlvbjogXCJJZiBkZXNpcmVkLCBhZGp1c3Qgb25lIGxvZ2dlZCB2YXJpYWJsZSAoaW50YWtlLCBhY3Rpdml0eSwgb3Igc2xlZXApIGFuZCByZWFzc2VzcyBhZnRlciBhZGRpdGlvbmFsIGRhdGEuXCIsXG4gIH0sXG4gIFwidG91Z2gtbG92ZVwiOiB7XG4gICAgaGVhZGxpbmU6IFwiRmxhdCBpc24ndCBmYWlsdXJlIOKAlCBpdCdzIGluZm9ybWF0aW9uLlwiLFxuICAgIGRldGFpbDpcbiAgICAgIFwiWW91ciBhdmVyYWdlcyBiYXJlbHkgbW92ZWQgYWNyb3NzIHRoZSB3aW5kb3cgd2UgY2hlY2tlZC4gVGhhdCBjYW4gbWVhbiBjb25zaXN0ZW5jeeKAlG9yIHRoYXQgb25lIGxldmVyIG5lZWRzIGEgZGVsaWJlcmF0ZSB0d2Vhay4gUGljayBvbmUgY2hhbmdlIHlvdSBjYW4gcmVwZWF0IGZvciB0d28gd2Vla3MuXCIsXG4gICAgYWN0aW9uOiBcIkNob29zZSBvbmUgbGV2ZXIgKHNsZWVwLCBzdGVwcywgb3IgY2Fsb3JpZXMpLCBhZGp1c3QgbW9kZXN0bHksIGFuZCBsb2cgZGFpbHkgc28gdGhlIG5leHQgcmVhZCBpcyBjbGVhbmVyLlwiLFxuICB9LFxuICBheXVydmVkaWM6IHtcbiAgICBoZWFkbGluZTogXCJBIHN0ZWFkeSBjaGFwdGVyIGluIHlvdXIgd2VpZ2h0IHJoeXRobS5cIixcbiAgICBkZXRhaWw6XG4gICAgICBcIllvdXIgcm9sbGluZyBhdmVyYWdlcyBzdGF5ZWQgY2xvc2UgdG9nZXRoZXLigJRsaWtlIGEgY2FsbSBzZWFzb24gaW4gdGhlIGJvZHkgcmF0aGVyIHRoYW4gYSBzaGFycCBzd2luZy4gR2VudGxlLCBzdXN0YWluYWJsZSBzaGlmdHMgc3RpbGwgdGVuZCB0byBsYW5kIGJldHRlciB0aGFuIGFicnVwdCBvbmVzLlwiLFxuICAgIGFjdGlvbjogXCJIb25vciBzdGVhZHkgcm91dGluZXM7IGlmIHlvdSBzZWVrIG1vdmVtZW50LCBzaGlmdCBvbmUgaGFiaXQgd2l0aCBwYXRpZW5jZSBhbmQga2VlcCBsb2dnaW5nLlwiLFxuICB9LFxufTtcblxuY29uc3QgU1RSRUFLOiBSZWNvcmQ8Q29hY2hUb25lLCB7IGhlYWRsaW5lOiBzdHJpbmc7IGRldGFpbDogc3RyaW5nOyBhY3Rpb246IHN0cmluZyB9PiA9IHtcbiAgZnJpZW5kbHk6IHtcbiAgICBoZWFkbGluZTogXCJcIiwgLy8gZmlsbGVkIHdpdGggbWlsZXN0b25lXG4gICAgZGV0YWlsOlxuICAgICAgXCJDb25zaXN0ZW5jeSBpcyBvbmUgb2YgeW91ciBzdHJvbmdlc3QgcHJlZGljdG9ycyBvZiBwcm9ncmVzcy4gS2VlcCB0aGUgc3RyZWFrIGFsaXZlIHRvbW9ycm93LlwiLFxuICAgIGFjdGlvbjogXCJMb2NrIGluIHRvbW9ycm934oCZcyB3ZWlnaC1pbiB0byBrZWVwIHN0cmVhayBtb21lbnR1bS5cIixcbiAgfSxcbiAgY2xpbmljYWw6IHtcbiAgICBoZWFkbGluZTogXCJcIixcbiAgICBkZXRhaWw6XG4gICAgICBcIkNvbnNlY3V0aXZlLWRheSBsb2dnaW5nIGltcHJvdmVzIHNpZ25hbCBxdWFsaXR5IGZvciB0cmVuZCBhbmFseXNpcy4gQ29udGludWUgZGFpbHkgZW50cmllcyB3aGVuIGZlYXNpYmxlLlwiLFxuICAgIGFjdGlvbjogXCJNYWludGFpbiBkYWlseSBsb2dnaW5nIHRvIHByZXNlcnZlIGRhdGEgY29udGludWl0eS5cIixcbiAgfSxcbiAgXCJ0b3VnaC1sb3ZlXCI6IHtcbiAgICBoZWFkbGluZTogXCJcIixcbiAgICBkZXRhaWw6XG4gICAgICBcIlN0cmVha3MgYXJlIGJ1aWx0IGluIGJvcmluZyBtb21lbnRzLiBTaG93IHVwIGFnYWluIHRvbW9ycm93IGFuZCB0aGUgZ3JhcGggc3RheXMgb24geW91ciBzaWRlLlwiLFxuICAgIGFjdGlvbjogXCJMb2cgdG9tb3Jyb3cgYmVmb3JlIHRoZSBkYXkgZW5kcyDigJQgcHJvdGVjdCB0aGUgY2hhaW4uXCIsXG4gIH0sXG4gIGF5dXJ2ZWRpYzoge1xuICAgIGhlYWRsaW5lOiBcIlwiLFxuICAgIGRldGFpbDpcbiAgICAgIFwiRGFpbHkgbG9nZ2luZyBjcmVhdGVzIGEgdHJ1c3R3b3J0aHkgcmh5dGht4oCUbGlrZSBzdGVhZHkgYmVhdHMgaW4gYSBwcmFjdGljZS4gVGhhdCBjb250aW51aXR5IHN1cHBvcnRzIGNsZWFyZXIgc2VsZi1hd2FyZW5lc3Mgb3ZlciB0aW1lLlwiLFxuICAgIGFjdGlvbjogXCJDb250aW51ZSB5b3VyIGdlbnRsZSBkYWlseSBjaGVjay1pbiB3aXRoIHRoZSBzY2FsZSB3aGVuIGl0IGZpdHMgeW91ciBkYXkuXCIsXG4gIH0sXG59O1xuXG5jb25zdCBCQVNFTElORTogUmVjb3JkPENvYWNoVG9uZSwgeyBoZWFkbGluZTogc3RyaW5nOyBkZXRhaWw6IHN0cmluZzsgYWN0aW9uOiBzdHJpbmcgfT4gPSB7XG4gIGZyaWVuZGx5OiB7XG4gICAgaGVhZGxpbmU6IFwiR3JlYXQgY29uc2lzdGVuY3kgc28gZmFyIOKAlCBrZWVwIGxvZ2dpbmcgZGFpbHkgZm9yIHNoYXJwZXIgaW5zaWdodHMuXCIsXG4gICAgZGV0YWlsOiBcIldlIG5lZWQgYSBiaXQgbW9yZSBzaWduYWwgdG8gZGV0ZWN0IHN0cm9uZyBwZXJzb25hbCBwYXR0ZXJucywgYnV0IHlvdXIgZGF0YSBmbG93IGlzIGFjdGl2ZS5cIixcbiAgICBhY3Rpb246IFwiS2VlcCB0cmFja2luZyBkYWlseSBoYWJpdHMgYW5kIHdlaWdodCB0byB1bmxvY2sgc3Ryb25nZXIgcGVyc29uYWxpemVkIGluc2lnaHRzLlwiLFxuICB9LFxuICBjbGluaWNhbDoge1xuICAgIGhlYWRsaW5lOiBcIkluc3VmZmljaWVudCBzaWduYWwgZm9yIGhpZ2gtY29uZmlkZW5jZSBwZXJzb25hbGl6ZWQgcnVsZXMuXCIsXG4gICAgZGV0YWlsOlxuICAgICAgXCJDdXJyZW50IGxvZyB2b2x1bWUgb3IgcGF0dGVybiBkaXZlcnNpdHkgaXMgYmVsb3cgdGhyZXNob2xkcyB1c2VkIGZvciBzdHJvbmdlciBpbmZlcmVuY2VzLiBDb250aW51ZSBzdHJ1Y3R1cmVkIGxvZ2dpbmcuXCIsXG4gICAgYWN0aW9uOiBcIk1haW50YWluIGRhaWx5IGVudHJpZXMgYWNyb3NzIHdlaWdodCBhbmQga2V5IGhhYml0IGZpZWxkcyB0byBpbXByb3ZlIG1vZGVsIGlucHV0cy5cIixcbiAgfSxcbiAgXCJ0b3VnaC1sb3ZlXCI6IHtcbiAgICBoZWFkbGluZTogXCJLZWVwIHN0YWNraW5nIGxvZ3Mg4oCUIHRoZSBjb2FjaCBnZXRzIHNtYXJ0ZXIgd2hlbiB5b3UgZG8uXCIsXG4gICAgZGV0YWlsOlxuICAgICAgXCJOb3QgZW5vdWdoIHBhdHRlcm4geWV0IGZvciBib2xkIGNhbGxvdXRzLiBUaGF0IGlzIG5vcm1hbCBlYXJseSBvbi4gQ29uc2lzdGVuY3kgYmVhdHMgaW50ZW5zaXR5IGhlcmUuXCIsXG4gICAgYWN0aW9uOiBcIkhpdCBhbm90aGVyIHdlZWsgb2YgZGFpbHkgbG9ncywgdGhlbiByZXZpc2l0IGluc2lnaHRzLlwiLFxuICB9LFxuICBheXVydmVkaWM6IHtcbiAgICBoZWFkbGluZTogXCJZb3VyIHByYWN0aWNlIGlzIGZvcm1pbmcg4oCUIGEgbGl0dGxlIG1vcmUgdGltZSB3aWxsIGRlZXBlbiB0aGUgcGljdHVyZS5cIixcbiAgICBkZXRhaWw6XG4gICAgICBcIlBhdHRlcm5zIGVtZXJnZSBhcyB5b3VyIGxvZ3MgYWNjdW11bGF0ZS4gU3RlYWR5LCBraW5kIGF0dGVudGlvbiB0byB0aGUgYmFzaWNzIG1hdHRlcnMgbW9yZSB0aGFuIHBlcmZlY3Qgd2Vla3MuXCIsXG4gICAgYWN0aW9uOiBcIkNvbnRpbnVlIHlvdXIgZGFpbHkgcmh5dGhtIG9mIGxvZ2dpbmc7IGluc2lnaHRzIHdpbGwgc2hhcnBlbiBuYXR1cmFsbHkuXCIsXG4gIH0sXG59O1xuXG5jb25zdCBOVURHRV9CWV9DQVQ6IFJlY29yZDxcbiAgRXhjbHVkZTxBaU51ZGdlQ2F0ZWdvcnksIFwiZ29hbF9wcm9ncmVzc1wiPixcbiAgUmVjb3JkPENvYWNoVG9uZSwgUm93PiAmIHsgd2VpZ2h0VHJlbmRVcD86IFJlY29yZDxDb2FjaFRvbmUsIFJvdz4gfVxuPiA9IHtcbiAgcGxhdGVhdToge1xuICAgIGZyaWVuZGx5OiB7XG4gICAgICB0aXRsZTogXCJXZWlnaHQgaGFzIGJlZW4gdW51c3VhbGx5IGZsYXRcIixcbiAgICAgIG1lc3NhZ2U6XG4gICAgICAgIFwiTW9ybmluZyB3ZWlnaHQgc3RheWVkIHdpdGhpbiBhIHRpZ2h0IGJhbmQgcmVjZW50bHkuIFRoYXQgY2FuIGhhcHBlbiBkdXJpbmcgc3RlYWR5IHBoYXNlcyBvciB3aGVuIGxvZ2dpbmcgdGltaW5nIGlzIHZlcnkgY29uc2lzdGVudC5cIixcbiAgICB9LFxuICAgIGNsaW5pY2FsOiB7XG4gICAgICB0aXRsZTogXCJQbGF0ZWF1IHBhdHRlcm4gaW4gbW9ybmluZyB3ZWlnaHRzXCIsXG4gICAgICBtZXNzYWdlOlxuICAgICAgICBcIlJlY2VudCBtb3JuaW5nIHdlaWdodHMgc2hvdyBsaW1pdGVkIHZhcmlhdGlvbiBvdmVyIHRoZSBzYW1wbGVkIHdpbmRvdy4gVGhpcyBkZXNjcmliZXMgbG9nZ2VkIHdlaWdodHMgb25seSwgbm90IGEgY2xpbmljYWwgcGxhdGVhdSBkaWFnbm9zaXMuXCIsXG4gICAgfSxcbiAgICBcInRvdWdoLWxvdmVcIjoge1xuICAgICAgdGl0bGU6IFwiWW91ciBzY2FsZSBpcyB3aGlzcGVyaW5nOiBob2xkIHN0ZWFkeVwiLFxuICAgICAgbWVzc2FnZTpcbiAgICAgICAgXCJOdW1iZXJzIGJhcmVseSBidWRnZWQg4oCUIHRoYXQgY2FuIG1lYW4geW91ciByb3V0aW5lIGlzIGxvY2tlZCBpbi4gSWYgeW91IHdhbnQgbW9yZSBtb3ZlbWVudCwgcGljayBvbmUgbGV2ZXIgKHNsZWVwLCBzdGVwcywgb3IgY2Fsb3JpZXMpIGFuZCBhZGp1c3Qgd2l0aCBpbnRlbnRpb24sIG5vdCBndWlsdC5cIixcbiAgICB9LFxuICAgIGF5dXJ2ZWRpYzoge1xuICAgICAgdGl0bGU6IFwiQSBzdGVhZHkgc2Vhc29uIGluIHlvdXIgbG9nc1wiLFxuICAgICAgbWVzc2FnZTpcbiAgICAgICAgXCJZb3VyIG1vcm5pbmcgd2VpZ2h0cyBzaG93IGEgY2FsbSwgc3RhYmxlIHJoeXRobSBsYXRlbHkg4oCUIGxpa2UgYSBzdGVhZHkgc2Vhc29uIHJhdGhlciB0aGFuIGEgc2hhcnAgc3dpbmcuIFNtYWxsLCBzdXN0YWluYWJsZSBzaGlmdHMgc3RpbGwgbGFuZCBiZXR0ZXIgdGhhbiBhYnJ1cHQgb25lcy5cIixcbiAgICB9LFxuICB9LFxuICB3ZWlnaHRfdHJlbmQ6IHtcbiAgICBmcmllbmRseToge1xuICAgICAgdGl0bGU6IFwiUmVjZW50IHdlZWsgc2tld3MgbGlnaHRlclwiLFxuICAgICAgbWVzc2FnZTpcbiAgICAgICAgXCJZb3VyIGF2ZXJhZ2UgbW9ybmluZyB3ZWlnaHQgb3ZlciB0aGUgbGFzdCA3IGRheXMgaXMgbG93ZXIgdGhhbiB0aGUgcHJpb3IgNyDigJQgbmljZSBkaXJlY3Rpb25hbCBzaWduYWwgZnJvbSB5b3VyIG93biBsb2dzLlwiLFxuICAgIH0sXG4gICAgY2xpbmljYWw6IHtcbiAgICAgIHRpdGxlOiBcIlNldmVuLWRheSBtZWFuIHdlaWdodCBkZWNyZWFzZWQgdnMgcHJpb3Igd2Vla1wiLFxuICAgICAgbWVzc2FnZTpcbiAgICAgICAgXCJDb21wYXJlZCB1c2luZyBvbmx5IGRhdGVkIG1vcm5pbmcgd2VpZ2h0czogdGhlIHJlY2VudCA3LWRheSBhdmVyYWdlIGlzIGxvd2VyIHRoYW4gdGhlIHByZXZpb3VzIDctZGF5IGF2ZXJhZ2UuXCIsXG4gICAgfSxcbiAgICBcInRvdWdoLWxvdmVcIjoge1xuICAgICAgdGl0bGU6IFwiRG93biB3ZWVrIOKAlCBjcmVkaXQgdGhlIHdvcmsgeW91IGFscmVhZHkgbG9nZ2VkXCIsXG4gICAgICBtZXNzYWdlOlxuICAgICAgICBcIlNldmVuLWRheSBhdmVyYWdlIGRpcHBlZCB2ZXJzdXMgdGhlIHdlZWsgYmVmb3JlLiBUaGF0IGlzIG1vbWVudHVtIHlvdSBlYXJuZWQgaW4gdGhlIGRhdGEg4oCUIGtlZXAgc2hvd2luZyB1cC5cIixcbiAgICB9LFxuICAgIGF5dXJ2ZWRpYzoge1xuICAgICAgdGl0bGU6IFwiQSBsaWdodGVyIHJoeXRobSB0aGlzIHdlZWtcIixcbiAgICAgIG1lc3NhZ2U6XG4gICAgICAgIFwiWW91ciByZWNlbnQgbW9ybmluZ3MgbGVhbiBhIHRvdWNoIGxpZ2h0ZXIgdGhhbiB0aGUgd2VlayBiZWZvcmUg4oCUIGEgZ2VudGxlIHNoaWZ0IGluIHRoZSBwYXR0ZXJuIHlvdXIgbG9ncyBhcmUgZHJhd2luZy5cIixcbiAgICB9LFxuICAgIHdlaWdodFRyZW5kVXA6IHtcbiAgICAgIGZyaWVuZGx5OiB7XG4gICAgICAgIHRpdGxlOiBcIlJlY2VudCB3ZWVrIHNrZXdzIGhlYXZpZXJcIixcbiAgICAgICAgbWVzc2FnZTpcbiAgICAgICAgICBcIllvdXIgYXZlcmFnZSBtb3JuaW5nIHdlaWdodCBvdmVyIHRoZSBsYXN0IDcgZGF5cyBpcyBoaWdoZXIgdGhhbiB0aGUgcHJpb3IgNyDigJQgd29ydGggbm90aWNpbmcgYXMgYSBwYXR0ZXJuLCBub3QgYSB2ZXJkaWN0LlwiLFxuICAgICAgfSxcbiAgICAgIGNsaW5pY2FsOiB7XG4gICAgICAgIHRpdGxlOiBcIlNldmVuLWRheSBtZWFuIHdlaWdodCBpbmNyZWFzZWQgdnMgcHJpb3Igd2Vla1wiLFxuICAgICAgICBtZXNzYWdlOlxuICAgICAgICAgIFwiQ29tcGFyZWQgdXNpbmcgb25seSBkYXRlZCBtb3JuaW5nIHdlaWdodHM6IHRoZSByZWNlbnQgNy1kYXkgYXZlcmFnZSBpcyBoaWdoZXIgdGhhbiB0aGUgcHJldmlvdXMgNy1kYXkgYXZlcmFnZS5cIixcbiAgICAgIH0sXG4gICAgICBcInRvdWdoLWxvdmVcIjoge1xuICAgICAgICB0aXRsZTogXCJVcCB3ZWVrIOKAlCBub3RpY2UgaXQsIG5vIHNwaXJhbFwiLFxuICAgICAgICBtZXNzYWdlOlxuICAgICAgICAgIFwiU2V2ZW4tZGF5IGF2ZXJhZ2Ugcm9zZSB2ZXJzdXMgdGhlIHdlZWsgYmVmb3JlLiBUcmVhdCBpdCBhcyBzaWduYWwgZnJvbSB5b3VyIGxvZ3MsIG5vdCBhIHNjb3JlIG9uIHlvdSDigJQgb25lIHN0ZWFkeSB3ZWVrIG9mIGJhc2ljcyBjYW4gdHVybiB0aGUgY3VydmUuXCIsXG4gICAgICB9LFxuICAgICAgYXl1cnZlZGljOiB7XG4gICAgICAgIHRpdGxlOiBcIkEgc2xpZ2h0bHkgaGVhdmllciBjYWRlbmNlIHRoaXMgd2Vla1wiLFxuICAgICAgICBtZXNzYWdlOlxuICAgICAgICAgIFwiWW91ciBsb2dzIHNob3cgYSBtb2Rlc3QgdXB3YXJkIHNoaWZ0IHdlZWsgb3ZlciB3ZWVrIGluIG1vcm5pbmcgd2VpZ2h0IOKAlCBhIHBhdHRlcm4gdG8gb2JzZXJ2ZSB3aXRoIHBhdGllbmNlLCBub3QgYWxhcm0uXCIsXG4gICAgICB9LFxuICAgIH0sXG4gIH0sXG4gIHNsZWVwX3JlY292ZXJ5OiB7XG4gICAgZnJpZW5kbHk6IHtcbiAgICAgIHRpdGxlOiBcIlNsZWVwIGxvb2tzIGEgYml0IHNob3J0IGluIHlvdXIgbG9nc1wiLFxuICAgICAgbWVzc2FnZTpcbiAgICAgICAgXCJTaG9ydCBzbGVlcCBjYW4gbGluZSB1cCB3aXRoIG5vaXNpZXIgaHVuZ2VyIGFuZCBlbmVyZ3kg4oCUIHdlIGFyZSBvbmx5IGRlc2NyaWJpbmcgd2hhdCB5b3UgbG9nZ2VkLCBub3QgZGlhZ25vc2luZyBhIGNvbmRpdGlvbi5cIixcbiAgICB9LFxuICAgIGNsaW5pY2FsOiB7XG4gICAgICB0aXRsZTogXCJCZWxvdy1hdmVyYWdlIHNsZWVwIGR1cmF0aW9uIGluIGxvZ3NcIixcbiAgICAgIG1lc3NhZ2U6XG4gICAgICAgIFwiTWVhbiBzZWxmLXJlcG9ydGVkIHNsZWVwIG92ZXIgdGhlIHNhbXBsZWQgd2luZG93IGlzIHVuZGVyIGNvbW1vbiBoZWFsdGh5LXNsZWVwIHJhbmdlcy4gVGhpcyByZWZsZWN0cyB5b3VyIGVudHJpZXMgb25seS5cIixcbiAgICB9LFxuICAgIFwidG91Z2gtbG92ZVwiOiB7XG4gICAgICB0aXRsZTogXCJTbGVlcCBpcyBsZWF2aW5nIG1vbmV5IG9uIHRoZSB0YWJsZVwiLFxuICAgICAgbWVzc2FnZTpcbiAgICAgICAgXCJZb3VyIGxvZ3Mgc2hvdyBzaG9ydCBuaWdodHMgc3RhY2tpbmcgdXAuIFByb3RlY3Rpbmcgc2xlZXAgaXMgb25lIG9mIHRoZSBoaWdoZXN0LWxldmVyYWdlIGhhYml0cyBmb3IgaHVuZ2VyIGFuZCB0cmFpbmluZyDigJQgbm90IGEgbGVjdHVyZSwganVzdCB0aGUgZGF0YSB5b3UgZW50ZXJlZC5cIixcbiAgICB9LFxuICAgIGF5dXJ2ZWRpYzoge1xuICAgICAgdGl0bGU6IFwiRXZlbmluZ3MgbWF5IGJlIGFza2luZyBmb3IgbW9yZSByZXN0XCIsXG4gICAgICBtZXNzYWdlOlxuICAgICAgICBcIllvdXIgc2xlZXAgZW50cmllcyBzdWdnZXN0IGEgc2hvcnRlciBuaWdodGx5IHJoeXRobSBsYXRlbHkuIEhvbm9yaW5nIHJlc3QgY2FuIHN1cHBvcnQgc3RlYWRpZXIgZW5lcmd5IGFuZCBhcHBldGl0ZSDigJQgYXMgcmVmbGVjdGVkIGluIHlvdXIgb3duIGxvZ3MuXCIsXG4gICAgfSxcbiAgICB3ZWlnaHRUcmVuZFVwOiB7XG4gICAgICBmcmllbmRseToge1xuICAgICAgICB0aXRsZTogXCJTbGVlcCBpcyBvbiB0aGUgaGlnaCBzaWRlIGluIHlvdXIgbG9nc1wiLFxuICAgICAgICBtZXNzYWdlOlxuICAgICAgICAgIFwiWW91IGxvZ2dlZCBtb3JlIHNsZWVwIHRoYW4gdHlwaWNhbCDigJQgY291bGQgcmVmbGVjdCByZWNvdmVyeSBvciBkaWZmZXJlbnQgbG9nZ2luZyB0aW1lcy5cIixcbiAgICAgIH0sXG4gICAgICBjbGluaWNhbDoge1xuICAgICAgICB0aXRsZTogXCJBYm92ZS1hdmVyYWdlIHNsZWVwIGR1cmF0aW9uIGluIGxvZ3NcIixcbiAgICAgICAgbWVzc2FnZTpcbiAgICAgICAgICBcIk1lYW4gc2VsZi1yZXBvcnRlZCBzbGVlcCBvdmVyIHRoZSBzYW1wbGVkIHdpbmRvdyBleGNlZWRzIHR5cGljYWwgcmFuZ2VzLiBJbnRlcnByZXRhdGlvbiBkZXBlbmRzIG9uIGhvdyBhbmQgd2hlbiB5b3UgbG9nLlwiLFxuICAgICAgfSxcbiAgICAgIFwidG91Z2gtbG92ZVwiOiB7XG4gICAgICAgIHRpdGxlOiBcIkJpZyBzbGVlcCBudW1iZXJzIOKAlCB1c2UgdGhlbSBpZiB5b3UgdHJhaW5lZCBoYXJkXCIsXG4gICAgICAgIG1lc3NhZ2U6XG4gICAgICAgICAgXCJZb3UgbG9nZ2VkIGdlbmVyb3VzIHNsZWVwLiBJZiB0cmFpbmluZyBsb2FkIHdhcyBoaWdoLCB0aGF0IGNhbiBiZSBhcHByb3ByaWF0ZTsgaWYgbm90LCBjaGVjayB3aGV0aGVyIGxvZ2dpbmcgdGltZXMgc2hpZnRlZC5cIixcbiAgICAgIH0sXG4gICAgICBheXVydmVkaWM6IHtcbiAgICAgICAgdGl0bGU6IFwiQSBzcGFjaW91cyBuaWdodCByaHl0aG0gaW4geW91ciBlbnRyaWVzXCIsXG4gICAgICAgIG1lc3NhZ2U6XG4gICAgICAgICAgXCJZb3VyIGxvZ3Mgc2hvdyBtb3JlIHNsZWVwIHRoYW4gdXN1YWwg4oCUIHNvbWV0aW1lcyB0aGUgYm9keSBhc2tzIGZvciBleHRyYSByZWNvdmVyeTsgc29tZXRpbWVzIGxvZ2dpbmcgc2hpZnRzLiBFaXRoZXIgd2F5LCBpdCBpcyB5b3VyIHBhdHRlcm4gdG8gcmVhZCBnZW50bHkuXCIsXG4gICAgICB9LFxuICAgIH0sXG4gIH0sXG4gIGhhYml0X3BhdHRlcm46IHtcbiAgICBmcmllbmRseToge1xuICAgICAgdGl0bGU6IFwiTGF0ZS1zbmFjayBwYXR0ZXJuIHNob3dpbmcgdXBcIixcbiAgICAgIG1lc3NhZ2U6XG4gICAgICAgIFwiWW91IG1hcmtlZCBzZXZlcmFsIGxhdGUtc25hY2sgZXZlbmluZ3MgcmVjZW50bHkuIElmIG1vcm5pbmdzIGZlZWwgaGFyZGVyIG9uIHRob3NlIGRheXMsIGNvbnNpZGVyIGEgc2ltcGxlIHdpbmQtZG93biByb3V0aW5lIOKAlCBzdGlsbCB5b3VyIGNob2ljZS5cIixcbiAgICB9LFxuICAgIGNsaW5pY2FsOiB7XG4gICAgICB0aXRsZTogXCJGcmVxdWVudCBsYXRlLXNuYWNrIGZsYWdzXCIsXG4gICAgICBtZXNzYWdlOlxuICAgICAgICBcIk11bHRpcGxlIGxhdGUtc25hY2sgaW5kaWNhdG9ycyBpbiB0aGUgcmVjZW50IHdpbmRvdy4gVGhpcyBpcyBkZXJpdmVkIGZyb20gYm9vbGVhbiBmbGFncyB5b3Ugc2F2ZWQsIG5vdCBmcm9tIG1lYWxzIG9yIHBob3Rvcy5cIixcbiAgICB9LFxuICAgIFwidG91Z2gtbG92ZVwiOiB7XG4gICAgICB0aXRsZTogXCJMYXRlIHNuYWNrcyBhcmUgc2hvd2luZyB1cCBpbiB0aGUgc2NvcmVib2FyZFwiLFxuICAgICAgbWVzc2FnZTpcbiAgICAgICAgXCJZb3UgZmxhZ2dlZCBsYXRlIHNuYWNrcyBvZnRlbi4gSWYgZW5lcmd5IG9yIGh1bmdlciBmZWVscyBvZmYsIHRyeSBtb3ZpbmcgY2Fsb3JpZXMgZWFybGllciBvbmNlIG9yIHR3aWNlIHRoaXMgd2VlayDigJQgc21hbGwgZXhwZXJpbWVudCwgbm8gc2hhbWUuXCIsXG4gICAgfSxcbiAgICBheXVydmVkaWM6IHtcbiAgICAgIHRpdGxlOiBcIkV2ZW5pbmcgbm91cmlzaG1lbnQgc2hvd2luZyBvZnRlbiBpbiB5b3VyIGZsYWdzXCIsXG4gICAgICBtZXNzYWdlOlxuICAgICAgICBcIllvdXIgbG9ncyBub3RlIHNldmVyYWwgbGF0ZS1zbmFjayBldmVuaW5ncy4gSWYgdGhhdCByaHl0aG0gZmVlbHMgaGVhdnksIGEgbGlnaHRlciwgZWFybGllciBldmVuaW5nIHBhdHRlcm4gbWlnaHQgYmFsYW5jZSB5b3VyIGRheSDigJQgeW91ciBjYWxsLlwiLFxuICAgIH0sXG4gIH0sXG4gIG51dHJpdGlvbl9wYXR0ZXJuOiB7XG4gICAgZnJpZW5kbHk6IHtcbiAgICAgIHRpdGxlOiBcIkNhbG9yaWUgbG9nZ2luZyBqdW1wZWQgYmV0d2VlbiB3ZWVrc1wiLFxuICAgICAgbWVzc2FnZTpcbiAgICAgICAgXCJZb3VyIGF2ZXJhZ2UgbG9nZ2VkIGNhbG9yaWVzIG1vdmVkIHdlZWstb3Zlci13ZWVrLiBCaWcgc3dpbmdzIGNhbiBtYWtlIHdlaWdodCB0cmVuZHMgaGFyZGVyIHRvIHJlYWQg4oCUIG5vdCBhIGp1ZGdtZW50IG9mIOKAnGdvb2TigJ0gb3Ig4oCcYmFkLuKAnVwiLFxuICAgIH0sXG4gICAgY2xpbmljYWw6IHtcbiAgICAgIHRpdGxlOiBcIk1hdGVyaWFsIHdlZWstb3Zlci13ZWVrIGNoYW5nZSBpbiBtZWFuIGxvZ2dlZCBjYWxvcmllc1wiLFxuICAgICAgbWVzc2FnZTpcbiAgICAgICAgXCJTZXZlbi1kYXkgYXZlcmFnZSBjYWxvcmllIGVudHJpZXMgZGlmZmVyIG1hdGVyaWFsbHkgZnJvbSB0aGUgcHJpb3Igd2Vlay4gVXNlcyBkYWlseSBlbnRyeSBjYWxvcmllcyB3aGVuIHByZXNlbnQuXCIsXG4gICAgfSxcbiAgICBcInRvdWdoLWxvdmVcIjoge1xuICAgICAgdGl0bGU6IFwiQ2Fsb3JpZXMgc3d1bmcgaGFyZCB3ZWVrIHRvIHdlZWtcIixcbiAgICAgIG1lc3NhZ2U6XG4gICAgICAgIFwiWW91ciBsb2dnZWQgaW50YWtlIG1vdmVkIGEgbG90IGJldHdlZW4gd2Vla3MuIElmIHRoZSBzY2FsZSBmZWVscyBub2lzeSwgdGlnaHRlbmluZyBjb25zaXN0ZW5jeSAoZXZlbiByb3VnaGx5KSBjYW4gbWFrZSBjYXVzZS1hbmQtZWZmZWN0IGVhc2llciB0byByZWFkLlwiLFxuICAgIH0sXG4gICAgYXl1cnZlZGljOiB7XG4gICAgICB0aXRsZTogXCJDYWxvcmllIHJoeXRobSBzaGlmdGVkIGJldHdlZW4gd2Vla3NcIixcbiAgICAgIG1lc3NhZ2U6XG4gICAgICAgIFwiWW91ciBsb2dnZWQgaW50YWtlIHNob3dzIGEgbm90aWNlYWJsZSBzd2luZyB3ZWVrIG92ZXIgd2Vlay4gU3RlYWRpZXIgZnVlbGluZyBvZnRlbiByZWFkcyBhcyBzdGVhZGllciBzaWduYWxzIG9uIHRoZSBzY2FsZSDigJQgc3RpbGwgeW91ciBqb3VybmV5IHRvIHBhY2UuXCIsXG4gICAgfSxcbiAgfSxcbn07XG5cbmZ1bmN0aW9uIHdlaWdodFRyZW5kSXNVcChudWRnZTogQWlOdWRnZSk6IGJvb2xlYW4ge1xuICByZXR1cm4gKFxuICAgIG51ZGdlLnRpdGxlLmluY2x1ZGVzKFwiaGVhdmllclwiKSB8fFxuICAgIG51ZGdlLm1lc3NhZ2UuaW5jbHVkZXMoXCJoaWdoZXIgdGhhbiB0aGUgcHJpb3JcIikgfHxcbiAgICBudWRnZS5tZXNzYWdlLmluY2x1ZGVzKFwiaGlnaGVyIHRoYW4gdGhlIHByaW9yIDdcIilcbiAgKTtcbn1cblxuZnVuY3Rpb24gc2xlZXBJc0hpZ2gobnVkZ2U6IEFpTnVkZ2UpOiBib29sZWFuIHtcbiAgcmV0dXJuIG51ZGdlLnRpdGxlLmluY2x1ZGVzKFwiaGlnaCBzaWRlXCIpIHx8IG51ZGdlLm1lc3NhZ2UuaW5jbHVkZXMoXCJtb3JlIHNsZWVwIHRoYW4gdHlwaWNhbFwiKTtcbn1cblxuY29uc3QgR09BTF9USVRMRVM6IFJlY29yZDxDb2FjaFRvbmUsIHN0cmluZz4gPSB7XG4gIGZyaWVuZGx5OiBcIkdvYWwgcHJvZ3Jlc3MgZnJvbSB5b3VyIHN0YXJ0IHdlaWdodFwiLFxuICBjbGluaWNhbDogXCJQcm9ncmVzcyB0b3dhcmQgbG9nZ2VkIGdvYWwgd2VpZ2h0XCIsXG4gIFwidG91Z2gtbG92ZVwiOiBcIkdvYWwgZGlzdGFuY2Ug4oCUIHlvdSBoYXZlIGNoaXBwZWQgYXdheSBhdCBpdFwiLFxuICBheXVydmVkaWM6IFwiTW92ZW1lbnQgYWxvbmcgdGhlIGdvYWwgcGF0aCB5b3Ugc2V0XCIsXG59O1xuXG5leHBvcnQgZnVuY3Rpb24gYXBwbHlDb2FjaFRvbmVUb0FpTnVkZ2UobnVkZ2U6IEFpTnVkZ2UsIHRvbmU6IENvYWNoVG9uZSk6IEFpTnVkZ2Uge1xuICBjb25zdCB0ID0gbm9ybWFsaXplQ29hY2hUb25lKHRvbmUpO1xuICBpZiAodCA9PT0gXCJmcmllbmRseVwiKSByZXR1cm4gbnVkZ2U7XG5cbiAgLyoqIEdvYWwgbnVkZ2UgbWVzc2FnZSBpbmNsdWRlcyBjb21wdXRlZCAlIOKAlCBuZXZlciByZXBsYWNlIGJvZHkgY29weS4gKi9cbiAgaWYgKG51ZGdlLmNhdGVnb3J5ID09PSBcImdvYWxfcHJvZ3Jlc3NcIikge1xuICAgIHJldHVybiB7IC4uLm51ZGdlLCB0aXRsZTogR09BTF9USVRMRVNbdF0gPz8gbnVkZ2UudGl0bGUgfTtcbiAgfVxuXG4gIGxldCByb3c6IFJvdyB8IHVuZGVmaW5lZDtcbiAgY29uc3QgY2F0ID0gbnVkZ2UuY2F0ZWdvcnk7XG4gIGNvbnN0IGJsb2NrID0gTlVER0VfQllfQ0FUW2NhdF07XG4gIGlmICghYmxvY2spIHJldHVybiBudWRnZTtcblxuICBpZiAoY2F0ID09PSBcIndlaWdodF90cmVuZFwiICYmIHdlaWdodFRyZW5kSXNVcChudWRnZSkpIHtcbiAgICByb3cgPSBibG9jay53ZWlnaHRUcmVuZFVwPy5bdF07XG4gIH0gZWxzZSBpZiAoY2F0ID09PSBcInNsZWVwX3JlY292ZXJ5XCIgJiYgc2xlZXBJc0hpZ2gobnVkZ2UpKSB7XG4gICAgcm93ID0gYmxvY2sud2VpZ2h0VHJlbmRVcD8uW3RdO1xuICB9IGVsc2Uge1xuICAgIHJvdyA9IGJsb2NrW3RdIGFzIFJvdztcbiAgfVxuXG4gIGlmICghcm93KSByZXR1cm4gbnVkZ2U7XG4gIHJldHVybiB7XG4gICAgLi4ubnVkZ2UsXG4gICAgdGl0bGU6IHJvdy50aXRsZSxcbiAgICBtZXNzYWdlOiByb3cubWVzc2FnZSxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFwcGx5Q29hY2hUb25lVG9BaU51ZGdlcyhudWRnZXM6IEFpTnVkZ2VbXSwgdG9uZTogQ29hY2hUb25lIHwgdW5kZWZpbmVkKTogQWlOdWRnZVtdIHtcbiAgY29uc3QgdCA9IG5vcm1hbGl6ZUNvYWNoVG9uZSh0b25lKTtcbiAgcmV0dXJuIG51ZGdlcy5tYXAoKG4pID0+IGFwcGx5Q29hY2hUb25lVG9BaU51ZGdlKG4sIHQpKTtcbn1cblxuZnVuY3Rpb24gc3RyZWFrTWlsZXN0b25lRnJvbUluc2lnaHQoaW5zOiBJbnNpZ2h0KTogbnVtYmVyIHwgbnVsbCB7XG4gIGNvbnN0IG0gPSBpbnMuaWQubWF0Y2goL15zdHJlYWstKFxcZCspLS8pO1xuICBpZiAobSkgcmV0dXJuIE51bWJlcihtWzFdKTtcbiAgY29uc3QgbGluZSA9IGlucy53aHkuZmluZCgodykgPT4gdy5pbmNsdWRlcyhcIk1pbGVzdG9uZSByZWFjaGVkOlwiKSk7XG4gIGlmIChsaW5lKSB7XG4gICAgY29uc3QgbW0gPSBsaW5lLm1hdGNoKC8oXFxkKylcXHMqZGF5cy8pO1xuICAgIGlmIChtbSkgcmV0dXJuIE51bWJlcihtbVsxXSk7XG4gIH1cbiAgcmV0dXJuIG51bGw7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhcHBseUNvYWNoVG9uZVRvSW5zaWdodChpbnM6IEluc2lnaHQsIHRvbmU6IENvYWNoVG9uZSk6IEluc2lnaHQge1xuICBjb25zdCB0ID0gbm9ybWFsaXplQ29hY2hUb25lKHRvbmUpO1xuICBpZiAodCA9PT0gXCJmcmllbmRseVwiKSByZXR1cm4gaW5zO1xuXG4gIGlmIChpbnMuY2F0ZWdvcnkgPT09IFwicGxhdGVhdVwiKSB7XG4gICAgY29uc3QgcCA9IFBMQVRFQVVbdF07XG4gICAgcmV0dXJuIHsgLi4uaW5zLCBoZWFkbGluZTogcC5oZWFkbGluZSwgZGV0YWlsOiBwLmRldGFpbCwgYWN0aW9uOiBwLmFjdGlvbiwgd2h5OiBpbnMud2h5IH07XG4gIH1cblxuICBpZiAoaW5zLmNhdGVnb3J5ID09PSBcInN0cmVha1wiKSB7XG4gICAgY29uc3QgbSA9IHN0cmVha01pbGVzdG9uZUZyb21JbnNpZ2h0KGlucykgPz8gNztcbiAgICBjb25zdCBzID0gU1RSRUFLW3RdO1xuICAgIGNvbnN0IGhlYWRsaW5lID1cbiAgICAgIHQgPT09IFwiY2xpbmljYWxcIlxuICAgICAgICA/IGAke219LWRheSBjb25zZWN1dGl2ZSBsb2dnaW5nIHN0cmVhay5gXG4gICAgICAgIDogdCA9PT0gXCJ0b3VnaC1sb3ZlXCJcbiAgICAgICAgICA/IGAke219LWRheSBzdHJlYWsg4oCUIGtlZXAgdGhlIGNoYWluLmBcbiAgICAgICAgICA6IHQgPT09IFwiYXl1cnZlZGljXCJcbiAgICAgICAgICAgID8gYCR7bX0gZGF5cyBvZiBzdGVhZHkgbG9nZ2luZyDigJQgYSBncm91bmRlZCByaHl0aG0uYFxuICAgICAgICAgICAgOiBgJHttfS1kYXkgbG9nZ2luZyBzdHJlYWsuIE5pY2Ugd29yay5gO1xuICAgIHJldHVybiB7XG4gICAgICAuLi5pbnMsXG4gICAgICBoZWFkbGluZSxcbiAgICAgIGRldGFpbDogcy5kZXRhaWwsXG4gICAgICBhY3Rpb246IHMuYWN0aW9uLFxuICAgICAgd2h5OiBpbnMud2h5LFxuICAgIH07XG4gIH1cblxuICBpZiAoaW5zLnJ1bGVJZCA9PT0gXCJiYXNlbGluZVwiKSB7XG4gICAgY29uc3QgYiA9IEJBU0VMSU5FW3RdO1xuICAgIHJldHVybiB7IC4uLmlucywgaGVhZGxpbmU6IGIuaGVhZGxpbmUsIGRldGFpbDogYi5kZXRhaWwsIGFjdGlvbjogYi5hY3Rpb24sIHdoeTogaW5zLndoeSB9O1xuICB9XG5cbiAgcmV0dXJuIGlucztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHdlZWtseUVuZXJneUNvYWNoTGluZShcbiAgdHJlbmQ6IFwiZGVmaWNpdFwiIHwgXCJzdXJwbHVzXCIgfCBcIm5lYXJfbWFpbnRlbmFuY2VcIixcbiAgYXZnTmV0S2NhbDogbnVtYmVyLFxuICB0b25lOiBDb2FjaFRvbmUsXG4pOiBzdHJpbmcge1xuICBjb25zdCB0ID0gbm9ybWFsaXplQ29hY2hUb25lKHRvbmUpO1xuICBjb25zdCBuZXQgPSBNYXRoLnJvdW5kKGF2Z05ldEtjYWwpO1xuICBjb25zdCBiYXNlID0gYFRyYWlsaW5nIDctZGF5IGF2ZXJhZ2UgbmV0IGVuZXJneSAobG9nZ2VkIGludGFrZSBtaW51cyBlc3RpbWF0ZWQgYnVybikgaXMgYWJvdXQgJHtuZXR9IGtjYWwvZGF5OyB0cmVuZCBjbGFzczogJHt0cmVuZH0uYDtcblxuICBpZiAodCA9PT0gXCJjbGluaWNhbFwiKSByZXR1cm4gYmFzZTtcblxuICBpZiAodHJlbmQgPT09IFwiZGVmaWNpdFwiKSB7XG4gICAgaWYgKHQgPT09IFwiZnJpZW5kbHlcIilcbiAgICAgIHJldHVybiBgWW91ciBsYXN0IHdlZWsgYXZlcmFnZWQgYWJvdXQgJHtuZXR9IGtjYWwvZGF5IGJlbG93IGVzdGltYXRlZCBidXJuIOKAlCBhIGRlZmljaXQgcGF0dGVybiBpbiB5b3VyIGxvZ3MuIEtlZXAgZnVlbGluZyBlbm91Z2ggZm9yIHRyYWluaW5nIGFuZCByZWNvdmVyeS5gO1xuICAgIGlmICh0ID09PSBcInRvdWdoLWxvdmVcIilcbiAgICAgIHJldHVybiBgTGFzdCB3ZWVrIHlvdSBhdmVyYWdlZCByb3VnaGx5ICR7bmV0fSBrY2FsL2RheSB1bmRlciBidXJuIOKAlCB0aGF0IGlzIHJlYWwgZGVmaWNpdCB0ZXJyaXRvcnkgaW4gdGhlIGRhdGEuIE1ha2Ugc3VyZSBzdHJlbmd0aCBhbmQgc2xlZXAgc3RheSBwcm90ZWN0ZWQgd2hpbGUgeW91IHJ1biBpdC5gO1xuICAgIHJldHVybiBgWW91ciB3ZWVrIGxlYW5lZCBpbnRvIGEgZ2VudGxlIGRlZmljaXQgcmh5dGhtICh+JHtuZXR9IGtjYWwvZGF5IG5ldCkuIFN0ZWFkeSBub3VyaXNobWVudCBhbmQgcmVzdCBzdGlsbCBtYXR0ZXIgYWxvbmdzaWRlIHRoZSB0cmVuZCB5b3VyIGVudHJpZXMgc2hvdy5gO1xuICB9XG4gIGlmICh0cmVuZCA9PT0gXCJzdXJwbHVzXCIpIHtcbiAgICBpZiAodCA9PT0gXCJmcmllbmRseVwiKVxuICAgICAgcmV0dXJuIGBZb3VyIGxhc3Qgd2VlayBhdmVyYWdlZCBhYm91dCAke25ldH0ga2NhbC9kYXkgYWJvdmUgZXN0aW1hdGVkIGJ1cm4g4oCUIGEgc3VycGx1cyBwYXR0ZXJuIGluIHlvdXIgbG9ncy5gO1xuICAgIGlmICh0ID09PSBcInRvdWdoLWxvdmVcIilcbiAgICAgIHJldHVybiBgUm91Z2hseSAke25ldH0ga2NhbC9kYXkgb3ZlciBidXJuIGxhc3Qgd2VlayDigJQgY2FsbCBpdCB3aGF0IGl0IGlzIGluIHRoZSBudW1iZXJzLCB0aGVuIGRlY2lkZSBpZiB0aGF0IG1hdGNoZXMgeW91ciBpbnRlbnQuYDtcbiAgICByZXR1cm4gYFRoZSBwYXN0IHdlZWsgc2hvd3MgYSBzdXJwbHVzIGNhZGVuY2UgKH4ke25ldH0ga2NhbC9kYXkgbmV0KS4gSWYgdGhhdCBhbGlnbnMgd2l0aCB5b3VyIGdvYWxzLCBmaW5lOyBpZiBub3QsIHNtYWxsIHBhY2luZyBzaGlmdHMgY2FuIHJlYmFsYW5jZS5gO1xuICB9XG4gIGlmICh0ID09PSBcImZyaWVuZGx5XCIpXG4gICAgcmV0dXJuIGBOZXQgZW5lcmd5IGxhc3Qgd2VlayBob3ZlcmVkIG5lYXIgYmFsYW5jZSAofiR7bmV0fSBrY2FsL2RheSB2cyBidXJuIGVzdGltYXRlcykg4oCUIG1haW50ZW5hbmNlLWlzaCBpbiB5b3VyIGxvZ3MuYDtcbiAgaWYgKHQgPT09IFwidG91Z2gtbG92ZVwiKVxuICAgIHJldHVybiBgWW91IGJhc2ljYWxseSByYW4gZXZlbiBsYXN0IHdlZWsgKH4ke25ldH0ga2NhbC9kYXkgbmV0KS4gTWFpbnRlbmFuY2UgaXMgYSB2YWxpZCB0YXJnZXQg4oCUIGp1c3QgbmFtZSBpdCBzbyBleHBlY3RhdGlvbnMgbWF0Y2ggdGhlIHNjYWxlLmA7XG4gIHJldHVybiBgWW91ciB3ZWVrIHNhdCBuZWFyIGVxdWlsaWJyaXVtICh+JHtuZXR9IGtjYWwvZGF5IG5ldCkg4oCUIGEgYmFsYW5jZWQgcmh5dGhtIGluIHRoZSBlbnRyaWVzIHlvdSBzYXZlZC5gO1xufVxuIl19