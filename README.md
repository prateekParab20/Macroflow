# MacroFlow

A private, on-device progressive web app for daily macros and a weekly meal plan. It looks at home on a phone: large titles, grouped cards, and a bottom tab bar. There is no account and no server.

## Run

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173) and, on a phone, add it to the Home Screen. The first launch walks through a short profile. After that, targets, foods, the log, the week plan, and weigh-ins stay in `localStorage`.

```bash
npm test
npm run build
npm run preview
```

## What you can do

- **Profile.** Sex, age, height, and weight in metric or imperial. Goal: lose, maintain, or gain. Activity is optional.
- **Today.** Calories left, plus protein, carbs, and fat against the day’s target. Log breakfast, lunch, dinner, and snacks from the food library. Enter the amount you ate in grams, milliliters, or the amount printed on the label (for example `1 bar` or `2/3 cup`). Macros scale from that food’s per-serving or per-100 g baseline.
- **Foods.** Add a food from the label by hand, or scan a photo. Search, star, edit, and delete. Twelve sample foods are included so a week can be planned before you scan anything.
- **Scan.** The photo is read in the browser with Tesseract. Every number is shown for confirmation and editing before it is saved. A mismatch between calories and the macros is called out.
- **Plan.** Shuffle builds a different 7-day plan from foods you log or star (sample foods fill in until then). Log any day into the diary.
- **Progress.** Weekly weigh-ins, a simple trend, and a small calorie nudge when that trend and your goal disagree.

## How targets are calculated

Basal metabolic rate uses the Mifflin–St Jeor equation:

- Women: `10 × kg + 6.25 × cm − 5 × age − 161`
- Men: `10 × kg + 6.25 × cm − 5 × age + 5`

That is multiplied by an activity factor (1.2 sedentary through 1.9 very active) to estimate maintenance. Losing subtracts 500 kcal. Gaining adds 400 kcal, inside the usual 300–500 surplus. The target is never set below 1,200 kcal.

Protein is about 2.0 g/kg when losing and 1.8 g/kg otherwise (kept within 1.6–2.2 g/kg). Fat is about 25–30% of calories. Carbs take the rest.

After two weigh-ins at least a week apart, the app compares the weekly rate with the goal and may shift the target by up to 300 kcal. The note on Profile and Progress explains the change.

These are estimates, not medical advice. The full disclaimer is in Profile.

## Scanning labels

Recognition runs locally. The English model and Tesseract core ship with the app, so a scan does not call an external API and does not need a key. The photo is deskewed, cropped to the nutrition-facts panel when a border is visible, and read more than once if the first pass misses calories or a macro. Use a clear photo of the nutrition facts panel. Serving size, calories, protein, carbs, and fat are filled in, plus fiber, sugar, and sodium when they are printed. Uncertain rows are marked so you can correct them before saving. Choose whether those numbers are for one serving, 100 g, or 100 ml.

## Logging a quantity

Saved foods keep the label baseline (one serving, or 100 g / 100 ml). When you add a food to a meal, the amount starts at that baseline — for example `170 g` or `1 bar` — and you change it to what you actually ate. There is no servings multiplier. A half portion is `85 g` or `0.5` bars, and the day’s calories and macros update from that.

## Privacy

Profile, foods, meals, plans, and weigh-ins never leave the browser. Reset everything from Profile.
