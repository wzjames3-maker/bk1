<div align="center">

# 🎙️ PodForge

**Turn any idea into a production-ready podcast episode — fully automated.**

Upload your material, pick a style, hit generate. PodForge handles scripting, voice synthesis, audio mixing, and show notes in one pipeline.

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)](https://typescriptlang.org)
[![Supabase](https://img.shields.io/badge/Supabase-Backend-3FCF8E?logo=supabase)](https://supabase.com)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

</div>

---

## ✨ Features

| Category | What you get |
|----------|-------------|
| 🤖 AI Scripting | DeepSeek-powered script generation with style presets (conversational, narrative, debate, interview) |
| 🗣️ Multi-Voice TTS | Aliyun + MiMo dual-engine router with per-role voice assignment |
| 🎵 Audio Pipeline | FFmpeg mixing — BGM, transitions, loudness normalization |
| 📝 Show Notes | Auto-generated chapters, highlights, and copy-ready summaries |
| ✏️ Script Editor | In-browser editing with AI polish & per-segment rewrite |
| 💳 Billing | Stripe checkout, pay-per-episode, atomic balance with pre-charge/refund |
| ⚡ Realtime | Supabase Realtime — watch pipeline progress live |
| 📊 Analytics | PostHog product analytics + Sentry error monitoring |

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Next.js 16 (App Router)            │
├──────────┬──────────┬──────────┬──────────┬─────────────┤
│  Landing │  Create  │ Episode  │ Billing  │  Settings   │
│   Page   │  Wizard  │  Detail  │   Page   │   Page      │
├──────────┴──────────┴──────────┴──────────┴─────────────┤
│                    API Routes (Server)                   │
├─────────────────────────────────────────────────────────┤
│              Pipeline Orchestrator (chain)               │
│   parse → script → tts → mix → post → settle           │
├────────┬────────┬────────┬────────┬─────────────────────┤
│DeepSeek│  TTS   │ FFmpeg │Supabase│   Upstash Redis     │
│  LLM   │ Router │  Mix   │Storage │   (concurrency lock)│
└────────┴────────┴────────┴────────┴─────────────────────┘
```

**Pipeline design:** Each step is an independent serverless function. The orchestrator returns `nextStep`, the route layer releases the Redis lock, then fires the next invocation — no deadlocks, no orphaned locks.

## 🚀 Quick Start

```bash
# Clone
git clone https://github.com/wzjames3-maker/bk1.git podforge
cd podforge

# Install
npm install

# Environment
cp .env.example .env.local   # fill in your keys

# Dev
npm run dev                  # → http://localhost:3000
```

### Required Environment Variables

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side admin access |
| `UPSTASH_REDIS_REST_URL` | Redis lock (Upstash) |
| `UPSTASH_REDIS_REST_TOKEN` | Redis token |
| `DEEPSEEK_API_KEY` | LLM script generation |
| `STRIPE_SECRET_KEY` | Payment processing |
| `STRIPE_WEBHOOK_SECRET` | Webhook signature verification |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Client-side Stripe |
| `NEXT_PUBLIC_POSTHOG_KEY` | Product analytics |
| `SENTRY_DSN` | Error monitoring |

### Database Setup

```bash
# Run schema in Supabase SQL editor
supabase/schema.sql          # tables, RLS, RPC functions
supabase/storage-setup.sql   # storage buckets & policies
supabase/rewrite-lock-setup.sql  # atomic rewrite/confirm guards
```

## 📁 Project Structure

```
src/
├── app/
│   ├── (app)/            # Authenticated pages (dashboard, create, episodes, billing)
│   ├── (auth)/           # Login / Register
│   ├── api/              # REST endpoints (pipeline, episodes, billing, upload)
│   └── page.tsx          # Landing page
├── components/
│   ├── billing/          # Balance card, transaction & usage lists
│   ├── create/           # 3-step creation wizard
│   ├── episode/          # Player, script editor, progress, show notes
│   ├── landing/          # Hero, features, pricing, how-it-works
│   └── ui/               # shadcn/ui primitives
├── lib/
│   ├── pipeline/         # Orchestrator, state machine, step implementations
│   ├── services/         # DeepSeek, TTS, FFmpeg, billing, cost estimation
│   ├── hooks/            # useEpisodeRealtime
│   └── supabase/         # Client / Server / Admin / Middleware
└── types/                # Shared TypeScript types
```

## 💡 Tech Stack

- **Framework:** Next.js 16 (App Router, Turbopack)
- **UI:** React 19 + shadcn/ui + Tailwind CSS 4
- **Backend:** Supabase (Auth, Postgres, Storage, Realtime)
- **AI:** DeepSeek API (script generation, polish, rewrite)
- **TTS:** Aliyun CosyVoice + MiMo (dual-engine router)
- **Audio:** FFmpeg (mixing, loudness, transitions)
- **Payments:** Stripe (Checkout + Webhook, pay-per-use)
- **Cache/Lock:** Upstash Redis (pipeline concurrency control)
- **Observability:** PostHog (analytics) + Sentry (errors)
- **Deploy:** Vercel (serverless, edge middleware)

## 🔒 Security Highlights

- Server-side cost estimation — client values are never trusted
- Atomic balance operations via Postgres RPC (`deduct_if_sufficient`)
- Webhook idempotency with unique index + insert-before-adjust
- Redis distributed lock with `try/finally` release
- Input clamping on all user-facing parameters
- Row Level Security on every table

## 📄 License

MIT © [wzjames3-maker](https://github.com/wzjames3-maker)

---

<div align="center">

**Built with ☕ and way too many late nights.**

Star ⭐ this repo if it saves you from editing audio at 3 AM.

</div>
This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
