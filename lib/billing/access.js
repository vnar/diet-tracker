"use strict";
/**
 * Pure helpers for subscription-gated product features (no AWS imports).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isPaidPlanActive = isPaidPlanActive;
function isPaidPlanActive(plan, status) {
    const p = (plan ?? "free").trim().toLowerCase();
    if (p === "free" || p === "")
        return false;
    const s = (status ?? "").trim().toLowerCase();
    return s === "active" || s === "trialing";
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWNjZXNzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiYWNjZXNzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7R0FFRzs7QUFFSCw0Q0FRQztBQVJELFNBQWdCLGdCQUFnQixDQUM5QixJQUF3QixFQUN4QixNQUEwQjtJQUUxQixNQUFNLENBQUMsR0FBRyxDQUFDLElBQUksSUFBSSxNQUFNLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxXQUFXLEVBQUUsQ0FBQztJQUNoRCxJQUFJLENBQUMsS0FBSyxNQUFNLElBQUksQ0FBQyxLQUFLLEVBQUU7UUFBRSxPQUFPLEtBQUssQ0FBQztJQUMzQyxNQUFNLENBQUMsR0FBRyxDQUFDLE1BQU0sSUFBSSxFQUFFLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxXQUFXLEVBQUUsQ0FBQztJQUM5QyxPQUFPLENBQUMsS0FBSyxRQUFRLElBQUksQ0FBQyxLQUFLLFVBQVUsQ0FBQztBQUM1QyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBQdXJlIGhlbHBlcnMgZm9yIHN1YnNjcmlwdGlvbi1nYXRlZCBwcm9kdWN0IGZlYXR1cmVzIChubyBBV1MgaW1wb3J0cykuXG4gKi9cblxuZXhwb3J0IGZ1bmN0aW9uIGlzUGFpZFBsYW5BY3RpdmUoXG4gIHBsYW46IHN0cmluZyB8IHVuZGVmaW5lZCxcbiAgc3RhdHVzOiBzdHJpbmcgfCB1bmRlZmluZWQsXG4pOiBib29sZWFuIHtcbiAgY29uc3QgcCA9IChwbGFuID8/IFwiZnJlZVwiKS50cmltKCkudG9Mb3dlckNhc2UoKTtcbiAgaWYgKHAgPT09IFwiZnJlZVwiIHx8IHAgPT09IFwiXCIpIHJldHVybiBmYWxzZTtcbiAgY29uc3QgcyA9IChzdGF0dXMgPz8gXCJcIikudHJpbSgpLnRvTG93ZXJDYXNlKCk7XG4gIHJldHVybiBzID09PSBcImFjdGl2ZVwiIHx8IHMgPT09IFwidHJpYWxpbmdcIjtcbn1cbiJdfQ==