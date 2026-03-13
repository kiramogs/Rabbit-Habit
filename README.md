# Habit Rabbit Web Clone

Web implementation of the Habit Rabbit habit tracker style and flows, based on the public App Store screenshots and official tutorial/FAQ behavior docs.

## Stack

- Next.js 16 + React 19 + TypeScript
- Tailwind CSS 4 (plus custom CSS theme)
- Firebase Firestore + Firebase Auth
- Firestore realtime subscriptions + client transactions

## What is implemented

- Phone-style UI shell and tabbed screens
- Home screen with rabbit room/garden and visible purchased items
- Habit tracker with weekly check circles and no-undo behavior
- Habit priority constraints:
  - 1 high priority max
  - 2 medium priority max
  - low priority for the rest
- Stats view with monthly goal %, month completions, and lifetime completions
- Mood tracker calendar with per-day editable mood icons
- Store with carrot purchases and visibility toggles
- Progression logic:
  - Habit completion increases energy + health
  - Level-ups award carrots
  - Mode and room settings persist

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Firebase setup required:

- Enable Firestore Database
- Enable Anonymous sign-in in Firebase Authentication
- Publish the rules from `firestore.rules`

## Build checks

```bash
npm run lint
npm run build
```

## Reference sources used

- App Store app metadata + screenshots:
  - https://itunes.apple.com/lookup?id=1522121879&country=us
- Official Habit Rabbit tutorial/FAQ pages:
  - https://superbyte.site/habitrabbit/tutorial
  - https://superbyte.site/habitrabbit/faq
