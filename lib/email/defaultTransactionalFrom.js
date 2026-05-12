"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveTransactionalEmailFrom = resolveTransactionalEmailFrom;
exports.DEFAULT_TRANSACTIONAL_EMAIL_FROM = void 0;
/** Default SES "From" for weekly report + digest sends when `TRANSACTIONAL_EMAIL_FROM` is unset. */
exports.DEFAULT_TRANSACTIONAL_EMAIL_FROM = "ojashealth2026@gmail.com";
/** Resolves the outbound From address; explicit env wins, otherwise product default. */
function resolveTransactionalEmailFrom() {
    const v = (process.env.TRANSACTIONAL_EMAIL_FROM ?? "").trim();
    return v || exports.DEFAULT_TRANSACTIONAL_EMAIL_FROM;
}
