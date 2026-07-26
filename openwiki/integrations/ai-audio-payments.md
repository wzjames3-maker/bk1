---
type: Integration Reference
title: AI, Audio, Storage, Payments, and Coordination Integrations
description: "Documents PodForge's external service adapters: DeepSeek-compatible LLM scripting, MiMo-only TTS, FFmpeg audio assembly, Supabase Storage/Realtime, Stripe top-ups, and Upstash Redis pipeline locking."
tags: [integrations, deepseek, mimo, ffmpeg, stripe, redis]
---

# External integrations

## LLM scripting and content

`src/lib/services/deepseek.ts` uses the OpenAI SDK against a configurable DeepSeek-compatible base URL, defaults to `deepseek-chat`, requests structured JSON, retries failures, and validates generated segments. `style-presets.ts` supplies the four current styles (`casual`, `deep`, `news`, `story`) and guides both script and TTS expression. Polish, rewrite, parser, and post-processing routes reuse the same validation boundary. Recent commit `1d8e8ed` added response formatting/retries for polish; current HEAD `4c43562` also refined prompt/audio-tag handling.

## MiMo TTS and audio

`tts-router.ts` resolves a database voice and dispatches only provider `mimo`; Aliyun was removed in commit `2936d8b`. `tts-mimo.ts` calls the MiMo OpenAI-compatible `/chat/completions` endpoint, places synthesis text in an `assistant` message, optionally precedes it with a style instruction, supports a voice-design variant where the user message is the style/voice description, and sends the selected preset voice in `audio.voice` for normal models. It supports JSON base64 or direct binary audio, applies an external timeout of at least 120 seconds, retries, and probes duration with fallbacks. The TTS step synthesizes segments serially, uploads MP3s, and keeps timing metadata for mixing and chapters. The four style presets now provide distinct TTS instructions; the LLM may also embed sparse emotion/action tags such as `(兴奋)` and `[笑]` in script text for MiMo to interpret. Seed data currently contains eight voices: four Chinese and four English.

FFmpeg is bundled through `@ffmpeg-installer/ffmpeg`. The current mix implementation downloads segment files, concatenates them, probes duration, and uploads `final.mp3`; despite older README wording, source evidence does not establish active BGM, transitions, or loudness normalization in the current path.

## Supabase Storage and Realtime

`materials` is private/user-scoped; `audio` is public and service-written. Segment, preview, and final paths include the user and episode IDs. Episode detail combines Realtime updates from `use-episode-realtime.ts` with a polling fallback. Supabase Auth/session middleware protects app pages and user routes; admin access is reserved for trusted server operations.

## Stripe and Redis

Stripe checkout uses the configured top-up tiers and the webhook verifies `stripe-signature`, handles `checkout.session.completed`, and delegates idempotent crediting to `topup`. The pipeline advance route uses Upstash Redis `pipeline:lock:<userId>` with `NX` and a 300-second expiry in production. It releases the lock before triggering the next step and retries that internal request up to three times.

Configuration and failure diagnosis belong in the [operations runbook](../operations/runbook.md); the [workflow page](../workflows/episode-generation.md) describes when each adapter is called.
