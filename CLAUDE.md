# The Rusti Shack — Project Guide

## What this is
A real e-commerce and rental website for **The Rusti Shack**, a small beach gear shop on **Apo Island, Philippines**. The shop rents and sells snorkel gear, surf gear, beach essentials, apparel, and fishing equipment to divers and tourists who cross from the mainland by bangka.

## Deployment
- **GitHub repo:** `connew-git/The-Rusti-Shack` (branch: `master`)
- **Live site:** `the-rusti-shack-woad.vercel.app`
- Vercel auto-deploys on every push to `master` — no manual deploy steps needed.
- Commit small and often. One meaningful change per commit.

## Data source
All product data lives in `Data/The_Rusti_Shack_Dataset.xlsx`. The Products sheet has every SKU with name, category, subcategory, unit price, rental rate, and availability (Sale only / Rental only / Both). Read this file before adding or changing any product information. Python is not installed on this machine — use Excel COM automation via PowerShell to read it.

## Pages built so far
| File | Purpose |
|---|---|
| `index.html` | Homepage — hero banner, about strip, category teaser with clickable pills |
| `gear.html` | Full product catalogue — 5 categories, product cards, detail modal, cart, checkout |
| `about.html` | About Apo Island, the shack's story, 4-step bangka travel guide |
| `find-us.html` | Two location cards (Main Shop + Dock Kiosk), hours, map embed, contact strip, bangka callout |

## Tech stack
- **Plain HTML, CSS, and vanilla JavaScript only.** No frameworks, no build tools, no npm.
- Cart state lives in `localStorage` under the key `rustiCart`.
- All pages are self-contained — shared styles are duplicated across files, not imported.

## Design vision
Warm, relaxed, and welcoming. The site should feel like the island itself — unhurried, sun-faded, honest. Nothing corporate. Nothing cold.

### Color palette
| Name | Hex | Used for |
|---|---|---|
| `--sand` | `#f5e9d3` | Page background, card backgrounds |
| `--ocean` | `#2a7a8c` | Nav, headers, rent badges, buttons |
| `--coral` | `#e07050` | CTAs, sale badges, accents |
| `--drift` | `#8b6f50` | Headings, category labels, earthy text |
| `--white` | `#ffffff` | Cards, modals |
| `--dark` | `#2c2c2c` | Body text, footer |

### Typography
- **Pacifico** (Google Fonts) — headings, logo, category labels. Warm and handwritten.
- **Lato** 300 / 400 / 700 (Google Fonts) — all body text, buttons, labels.

### Layout rules
- Max content width: `1100–1200px`, centered with `margin: 0 auto`.
- Border radius: `16px` for cards, `50px` for pills and buttons, `20px` for modals.
- Cards use CSS Grid with `repeat(auto-fill, minmax(200px, 1fr))` so they reflow naturally.

## Responsiveness — always required
Every change must work well on both **mobile phones and desktop screens**. Test at narrow widths. Use `clamp()` for font sizes, `flex-wrap` on rows, and media queries when the grid needs to collapse. The modal switches to single-column below 620px.

## Product cards and modal
- Cards show: emoji placeholder (until real photos), product name, buy price, rental rate (if rentable), For Sale / For Rent badges.
- Clicking a card opens a modal with a studio shot slot (left, large), a lifestyle shot slot (left, smaller), and product details + Buy/Rent buttons (right).
- Real photos are wired in by adding `data-studio="images/..."` and `data-lifestyle="images/..."` to the card `<div>`. The JS reads these automatically — no other changes needed.
- Show **parent SKUs only** on the gear page, not individual size/color variants.

## Images — not added yet
Real product photos are planned. The `Rusti-Shack-Images/` folder exists locally but is not committed. Add images when the site structure is stable and pages are complete. Name files to match SKU codes (e.g. `snk-001-studio.jpg`, `snk-001-lifestyle.jpg`).

## Tone and copy
- Warm, direct, slightly sun-bleached. Think: someone who lives on the island talking to a visitor.
- Short sentences. No marketing fluff.
- Use "bangka" (not "boat") for the local outrigger.
- Currency is USD (`$`) throughout the site.

## What not to do
- Do not introduce CSS frameworks, JS libraries, or package managers.
- Do not add a backend or server-side logic — this is a static site.
- Do not commit `Data/*.xlsx` changes unless the data has actually been updated.
- Do not duplicate product data by hand — always read from the Excel file first.
- **Never put passwords, API keys, or other secrets in code or on GitHub.** Secrets go in environment variables only.
