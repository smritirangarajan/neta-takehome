
# Neta — Hybrid Engineering Take‑Home (Frontend + Data)

**Context**  
Neta builds a packaging compliance and optimization platform for retailers with multi‑vendor private‑label programs. Under packaging **Extended Producer Responsibility (EPR)** laws, companies must report packaging weights/materials by category and pay fees accordingly. Vendors may be exempt; responsibilities can shift based on exemptions and branding. Your task is to prototype how Neta could centralize data, validate vendor submissions, and simulate EPR fees.

**What you’ll build (5–6 hours suggested)**  
A small, deployed prototype plus a short design brief. No backend required; use the CSV/XLSX in this starter kit (local JSON/mocks are fine).

---

## Files in this kit
- `materials.csv` — 60 allowed material names with category group (authoritative list)
- `fees.csv` — fee schedule (cents per gram) per material; optional eco_modulation_discount
- `vendors.csv` — 8 vendors with `exempt` flags
- `products.csv` — 20 SKUs linked to vendors
- `vendor_submissions_VEN-101.csv` — sample vendor data (intentional errors)
- `vendor_submissions_VEN-107.xlsx` — sample vendor data (intentional errors)
- `vendor_submissions_VEN-104.csv` — sample vendor data (intentional errors)
- `README_dataset.txt` — column definitions and notes

> **Intentional data quirks to catch**
> - Units in ounces and invalid unit strings (`grams`) — normalize to grams  
> - Case vs unit weights — divide case weights by `case_size`  
> - Invalid/typo material names (e.g., “Cardboard”, “Small format metal”)  
> - Invalid/typo categories (e.g., “Flex Plastic”)  
> - Missing weights  
> - Product weight mistakenly reported as packaging

---

## Part A — Design Brief (2–3 pages max)
Describe your approach to:
1. **Data model** (TS interfaces or ERD): SKUs, Vendors, Components, Materials, Fees, Exemptions/Responsibility.  
2. **Validation & ingestion flow**: unit normalization, category checks, missing fields, case vs unit.  
3. **Fee logic**: how you compute SKU‑level fees and totals (you may use the fee table directly on the client).  
4. **UX**: the key screens, their purpose, and why you prioritized them.

Deliver as a PDF or Markdown in your repo.

---

## Part B — Frontend Prototype (deploy to Vercel or Replit)
Build 3–4 minimal screens (React/Next/Vite or similar). Keep it clean, clear, and responsive.

1. **Overview Dashboard**  
   - Cards: Vendors submitted, SKUs covered, Total estimated fees, Items with errors  
   - Table: Top 10 SKUs by fee (sortable/filterable)

2. **Vendor Submission (mock)**  
   - CSV/XLSX upload or form entry  
   - Inline validation + normalization preview (weights in grams, materials mapped to allowed list)

3. **Admin Review**  
   - Queue of submissions (Needs Review / Valid / Error)  
   - Row‑level flags and inline edits  
   - Toggle exemption/responsibility (e.g., vendor vs retailer)

4. **Fee Simulator**  
   - Pick 1–3 SKUs, swap materials/weights  
   - Show before/after fees and responsibility outcome

**Nice‑to‑haves (pick one if time allows):**  
- Save draft to `localStorage`  
- CSV export of tables  
- “What changed” diff when Admin edits

**Accessibility basics:** proper labels, keyboard focus, readable contrast.

---

## Deliverables
- **Deployed URL** (Vercel/Replit)  
- **Repo link**  
- **Design brief** (PDF/MD)

---

## What we evaluate
- Clear data/validation model and fee logic  
- UX clarity and usefulness of the flows  
- Code quality and structure  
- Handling of messy real‑world inputs  
- Communication and trade‑off reasoning

---

## Setup tips
- You can import the CSV/XLSX directly in the browser (e.g., `papaparse`, `xlsx`) or preconvert to JSON.  
- No need for a backend; stubbing is fine.  
- Keep the fee schedule simple: `fee_cents_per_gram * grams`, optionally apply `eco_modulation_discount` if you choose.

**Good luck!** Feel free to include brief notes in your README about any assumptions.
