Neta Hybrid Case — Starter Dataset

FILES
- materials.csv                 : 60 allowed material categories with category_group
- fees.csv                      : fee_cents_per_gram per material_name (+ optional eco_modulation_discount)
- vendors.csv                   : vendor_id, vendor_name, exempt
- products.csv                  : sku_id, sku_name, vendor_id, category
- vendor_submissions_VEN-101.csv: sample vendor submission (CSV) with intentional errors
- vendor_submissions_VEN-107.xlsx: sample vendor submission (Excel) with intentional errors
- vendor_submissions_VEN-104.csv: sample vendor submission (CSV) with intentional errors

COLUMN DEFINITIONS
Vendor submissions (CSV/XLSX):
- vendor_id          : string (must match vendors.csv)
- sku_id             : string (must match products.csv)
- component          : string (e.g., Tray, Lid, Label)
- material_name      : string (must match materials.csv 'material_name')
- material_category  : string (must match materials.csv 'category_group')
- weight_value       : numeric; may be unit or case weight
- weight_unit        : 'g' or 'oz' (intentional errors include 'grams')
- quantity_basis     : 'unit' or 'case'
- case_size          : integer if quantity_basis == 'case' else blank
- notes              : free text

INTENTIONAL DATA ISSUES (for validation tests)
- Units in ounces and invalid unit strings ('grams'); normalize to grams
- Case vs unit confusion; divide case weights by case_size
- Invalid material names ('Cardboard', 'Small format metal')
- Invalid/typo categories ('Flex Plastic')
- Missing weights
- Product weight mistakenly reported as packaging

FEE TABLE NOTES
- fees.csv expresses fee_cents_per_gram at the material level
- eco_modulation_discount is a decimal proportion (e.g., 0.05 = 5% discount) you may apply if needed

EXPECTATIONS
- Use materials.csv as the authoritative allowed list for material_name and category_group
- Validate vendor submissions against allowed lists
- Output: totals by vendor, top 10 SKUs by fee, and a list of SKUs with missing or inconsistent data
