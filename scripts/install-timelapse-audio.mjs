#!/usr/bin/env node
/**
 * Copy a licensed MP3 into public/audio/timelapse-share.mp3 for the share timelapse viewer.
 *
 * Usage:
 *   node scripts/install-timelapse-audio.mjs ~/Downloads/Knockin-On-Heavens-Door-Instrumental.mp3
 */
import { copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dest = path.join(__dirname, "..", "public", "audio", "timelapse-share.mp3");
const src = process.argv[2]?.trim() || process.env.TIMELAPSE_AUDIO_SOURCE?.trim();

if (!src) {
  console.error("Usage: node scripts/install-timelapse-audio.mjs <path-to-licensed.mp3>");
  process.exit(1);
}
if (!existsSync(src)) {
  console.error(`Source not found: ${src}`);
  process.exit(1);
}

copyFileSync(src, dest);
console.log(`Installed ${dest}`);
console.log(
  "Next: bump TIMELAPSE_SHARE_AUDIO_VERSION in lib/share/timelapseShare.ts, then commit/deploy.",
);
