# Tagman (Next.js)

Modernized version of the original `tagman` game, rebuilt for Next.js App Router and Vercel deployment.

## What's improved

- Stable animation loop using `requestAnimationFrame`
- Difficulty modes (`easy`, `normal`, `hard`)
- Keyboard (`Arrow` + `WASD`) and touch controls
- Pause/resume support (`Space` or `P`)
- Persistent best score per difficulty via `localStorage`
- Type-safe game logic with strict TypeScript

## Stack

- Next.js (App Router)
- React + TypeScript
- ESLint (`core-web-vitals` + TypeScript)

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

- `npm run dev` - start local development server
- `npm run build` - production build
- `npm run start` - serve production build
- `npm run lint` - lint project
- `npm run typecheck` - TypeScript checks

## Deploy to Vercel

1. Push this project to a Git provider.
2. Import it in [Vercel](https://vercel.com/new).
3. Keep framework preset as **Next.js**.
4. Deploy.
