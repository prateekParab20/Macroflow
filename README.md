# MacroFlow

A private progressive web app for daily macros and a weekly meal plan. It looks at home on a phone: large titles, grouped cards, and a bottom tab bar. There is no account. Foods, the diary, and weigh-ins stay on this device. Looking up a package barcode sends only that code to Open Food Facts.

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
- **Foods.** Add a packaged food from its barcode, type a label by hand, or fall back to a photo of the nutrition facts. Search, star, edit, and delete. Twelve sample foods are included so a week can be planned before you add anything.
- **Barcode.** Type or scan an EAN or UPC. The app asks Open Food Facts for the name and macros, then you confirm the serving and every number before saving. No API key.
- **Label photo.** A fallback for products the database doesn’t have. The photo is read in the browser with Tesseract. Uncertain rows stay editable, and the calorie check uses only the numbers in the form.
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

## Adding a packaged food

The main path is the barcode. Enter the digits under the code, or scan it with the camera. EAN-13, EAN-8, UPC-A, and UPC-E use the browser’s barcode detector when it has one, and a small built-in reader otherwise. The lookup calls `https://world.openfoodfacts.org/api/v2/product/{barcode}.json` directly from the browser. That API responds with `Access-Control-Allow-Origin: *`, so no key and no proxy are required for a normal visit. Browsers won’t let the page set a `User-Agent` header; Open Food Facts still returns the product for this request. If the direct call is blocked, the app retries `GET /api/off/{barcode}` — a small Vercel function in this repo that fetches the same URL with a MacroFlow user agent.

There isn’t a fully free photo API that reads nutrition-facts panels reliably, so a label photo stays a fallback. Recognition runs on the device with the English model shipped in the app. The photo is deskewed, cropped to the nutrition-facts panel when a border is visible, and read more than once if the first pass misses calories or a macro. Amounts that can’t be a real label (long OCR digit runs) are left blank instead of being filled in. Every field, including the highlighted ones, can be edited. The note that compares calories with protein, carbs, and fat is recalculated from those fields only: a blank macro is not treated as zero, and impossible values are not printed back as a huge calorie total.

## Confirming the serving

Saved foods keep the label baseline (one serving, or 100 g / 100 ml). The confirm screen is where that exact quantity is checked — for example `3/4 cup (28 g)` — before the food is saved. When you later add it to a meal, the amount starts at that baseline and you change it to what you actually ate.

## Logging a quantity

Saved foods keep the label baseline (one serving, or 100 g / 100 ml). When you add a food to a meal, the amount starts at that baseline — for example `170 g` or `1 bar` — and you change it to what you actually ate. There is no servings multiplier. A half portion is `85 g` or `0.5` bars, and the day’s calories and macros update from that.

## Privacy

Profile, foods, meals, plans, and weigh-ins stay in the browser. A barcode lookup sends that code to Open Food Facts and nothing else. Label photos are not uploaded. Reset everything from Profile.
