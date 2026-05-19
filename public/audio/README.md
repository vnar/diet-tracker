# Timelapse share music

The public viewer at `/share?t=…` plays **`timelapse-share.mp3`** (or `NEXT_PUBLIC_TIMELAPSE_AUDIO_URL`).

## Knockin’ on Heaven’s Door (Guns N’ Roses style)

The GNR recording and melody are **copyrighted**. Ojas cannot ship that song from a random YouTube rip — you need a **licensed instrumental cover** for commercial use on ojas-health.com.

### Recommended license (GNR-style instrumental, ~4 min, F#)

1. Purchase **Commercial** rights (~$200) or confirm your tier covers web/app use:  
   [We Make Dance Music — Knockin’ on Heaven’s Door (Guns N’ Roses) Instrumental Cover](https://www.wemakedancemusic.com/en/knocking-on-heavens-door-guns-n-roses-instrumental-cover/)
2. Download the **320K MP3** from your purchase.
3. Install into the repo:

```bash
node scripts/install-timelapse-audio.mjs /path/to/your-licensed-knockin.mp3
```

4. Bump `TIMELAPSE_SHARE_AUDIO_VERSION` in `lib/share/timelapseShare.ts` (e.g. `kohod`) so browsers fetch the new file.
5. Commit `public/audio/timelapse-share.mp3` only if your license **allows redistribution** in git; otherwise host on S3/CloudFront and set:

```bash
NEXT_PUBLIC_TIMELAPSE_AUDIO_URL=https://your-cdn.example.com/audio/knockin-instrumental.mp3
```

Run `npm run amplify:sync-env` after setting that in Amplify console or `.env.local`.

Mechanical/performance royalties for the underlying Dylan composition may still apply when used commercially — the vendor’s license covers their recording, not necessarily all publishing rights.

## Current bundled fallback

| | |
|---|---|
| **Track** | **The Champion** |
| **Source** | [effacestudios/Royalty-Free-Music-Pack](https://github.com/effacestudios/Royalty-Free-Music-Pack) (CC0) |

Replace with your licensed KOHOD file using the steps above.
