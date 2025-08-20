import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { Material, Fee, Vendor, Product, VendorSubmission, ProcessedSubmission, ValidationIssue, FeeSummary, OverviewStats } from '../types';

class DataService {
  private materials: Material[] = [];
  private fees: Fee[] = [];
  private vendors: Vendor[] = [];
  private products: Product[] = [];
  private submissions: ProcessedSubmission[] = [];
  private validationIssues: ValidationIssue[] = [];

  async loadAllData(): Promise<void> {
    try {
      await Promise.all([
        this.loadMaterials(),
        this.loadFees(),
        this.loadVendors(),
        this.loadProducts()
        // Note: loadSubmissions() removed - users upload their own vendor files
      ]);
    } catch (error) {
      console.error('Error loading data:', error);
    }
  }

  private async loadMaterials(): Promise<void> {
    const response = await fetch('/materials.csv');
    if (!response.ok) {
      throw new Error(`Failed to load materials.csv: ${response.status}`);
    }
    const csvText = await response.text();
    const result = Papa.parse(csvText, { header: true });
    
    // Ensure string fields are properly converted
    this.materials = result.data.map((row: any) => ({
      material_name: String(row.material_name || ''),
      category_group: String(row.category_group || '')
    })) as Material[];
  }

  private async loadFees(): Promise<void> {
    const response = await fetch('/fees.csv');
    if (!response.ok) {
      throw new Error(`Failed to load fees.csv: ${response.status}`);
    }
    const csvText = await response.text();
    const result = Papa.parse(csvText, { header: true });
    
    // Ensure numeric fields are properly converted
    this.fees = result.data.map((row: any) => ({
      material_name: String(row.material_name || ''),
      category_group: String(row.category_group || ''),
      fee_cents_per_gram: parseFloat(String(row.fee_cents_per_gram || 0)) || 0,
      eco_modulation_discount: row.eco_modulation_discount 
        ? parseFloat(String(row.eco_modulation_discount)) || 0 
        : undefined
    })) as Fee[];
  }

  private async loadVendors(): Promise<void> {
    const response = await fetch('/vendors.csv');
    if (!response.ok) {
      throw new Error(`Failed to load vendors.csv: ${response.status}`);
    }
    const csvText = await response.text();
    const result = Papa.parse(csvText, { header: true });
    
    // Ensure boolean fields are properly converted
    this.vendors = result.data.map((row: any) => ({
      vendor_id: String(row.vendor_id || ''),
      vendor_name: String(row.vendor_name || ''),
      exempt: String(row.exempt || 'false').toLowerCase() === 'true'
    })) as Vendor[];
  }

  private async loadProducts(): Promise<void> {
    const response = await fetch('/products.csv');
    if (!response.ok) {
      throw new Error(`Failed to load products.csv: ${response.status}`);
    }
    const csvText = await response.text();
    const result = Papa.parse(csvText, { header: true });
    
    // Ensure string fields are properly converted
    this.products = result.data.map((row: any) => ({
      sku_id: String(row.sku_id || ''),
      sku_name: String(row.sku_name || ''),
      vendor_id: String(row.vendor_id || ''),
      category: String(row.category || '')
    })) as Product[];
  }

  private async loadSubmissions(): Promise<void> {
    try {
      // Load CSV submissions
      const ven101Response = await fetch('/vendor_submissions_VEN-101.csv');
      const ven101Text = await ven101Response.text();
      const ven101Data = Papa.parse(ven101Text, { header: true });
      
      const ven104Response = await fetch('/vendor_submissions_VEN-104.csv');
      const ven104Text = await ven104Response.text();
      const ven104Data = Papa.parse(ven104Text, { header: true });

      // Load Excel submission
      const ven107Response = await fetch('/vendor_submissions_VEN-107.xlsx');
      const ven107ArrayBuffer = await ven107Response.arrayBuffer();
      const ven107Workbook = XLSX.read(ven107ArrayBuffer, { type: 'array' });
      const ven107Sheet = ven107Workbook.Sheets[ven107Workbook.SheetNames[0]];
      const ven107Data = XLSX.utils.sheet_to_json(ven107Sheet);

      // Combine all submissions
      const allSubmissions = [
        ...(ven101Data.data as VendorSubmission[]),
        ...(ven104Data.data as VendorSubmission[]),
        ...(ven107Data as VendorSubmission[])
      ];

      // Process and validate submissions
      this.processSubmissions(allSubmissions);
    } catch (error) {
      console.error('Error loading submissions:', error);
    }
  }

  private processSubmissions(submissions: VendorSubmission[]): void {
    this.submissions = [];
    this.validationIssues = [];

    submissions.forEach((submission, index) => {
      const processed = this.processSubmission(submission, index + 1);
      if (processed) {
        this.submissions.push(processed);
      }
    });
  }

  private processSubmission(submission: VendorSubmission, rowNumber: number): ProcessedSubmission | null {
    const issues: ValidationIssue[] = [];
    
    // Ensure weight_value is a number
    const weightValue = typeof submission.weight_value === 'number' 
      ? submission.weight_value 
      : parseFloat(String(submission.weight_value || 0));
    
    if (isNaN(weightValue) || weightValue <= 0) {
      issues.push({
        row: rowNumber,
        field: 'weight_value',
        message: 'Invalid weight value',
        suggested_fix: 'Weight must be a positive number',
        severity: 'error'
      });
      return null;
    }
    
    // Validate required fields
    if (!submission.material_name || !submission.weight_unit) {
      issues.push({
        row: rowNumber,
        field: 'material_name,weight_unit',
        message: 'Missing required fields',
        suggested_fix: 'Fill in material_name and weight_unit',
        severity: 'error'
      });
      return null;
    }

    // Normalize weight to grams
    let normalizedWeight = weightValue;
    if (submission.weight_unit.toLowerCase() === 'ounces' || submission.weight_unit.toLowerCase() === 'oz') {
      normalizedWeight = weightValue * 28.35; // Convert ounces to grams
    } else if (submission.weight_unit.toLowerCase() === 'pounds' || submission.weight_unit.toLowerCase() === 'lbs') {
      normalizedWeight = weightValue * 453.59; // Convert pounds to grams
    } else if (submission.weight_unit.toLowerCase() !== 'grams' && submission.weight_unit.toLowerCase() !== 'g') {
      issues.push({
        row: rowNumber,
        field: 'weight_unit',
        message: `Invalid weight unit: ${submission.weight_unit}`,
        suggested_fix: 'Use grams, ounces, or pounds',
        severity: 'warning'
      });
    }

    // Handle case vs unit weights
    if (submission.quantity_basis === 'case' && submission.case_size) {
      const caseSize = typeof submission.case_size === 'number' 
        ? submission.case_size 
        : parseInt(String(submission.case_size || 1));
      
      if (caseSize > 0) {
        normalizedWeight = normalizedWeight / caseSize;
      }
    }

    // Validate material name
    const material = this.materials.find(m => 
      m.material_name.toLowerCase() === submission.material_name.toLowerCase()
    );
    
    if (!material) {
      issues.push({
        row: rowNumber,
        field: 'material_name',
        message: `Invalid material: ${submission.material_name}`,
        suggested_fix: 'Use a valid material from the materials list',
        severity: 'error'
      });
    }
    
    // Check for obvious outliers (component > 300g)
    if (normalizedWeight > 300) {
      issues.push({
        row: rowNumber,
        field: 'weight_value',
        message: `Weight seems unusually high: ${normalizedWeight.toFixed(2)}g`,
        suggested_fix: 'Verify this is packaging weight, not product weight',
        severity: 'warning'
      });
    }

    // Validate category
    if (material && material.category_group !== submission.material_category) {
      issues.push({
        row: rowNumber,
        field: 'material_category',
        message: `Category mismatch: ${submission.material_category} should be ${material.category_group}`,
        suggested_fix: `Change category to ${material.category_group}`,
        severity: 'warning'
      });
    }

    // Calculate fees
    let feeCents = 0;
    let feeRate = 0;
    let ecoDiscount = 0;
    
    if (material) {
      const feeInfo = this.fees.find(f => f.material_name === material.material_name);
      if (feeInfo && typeof feeInfo.fee_cents_per_gram === 'number') {
        feeRate = feeInfo.fee_cents_per_gram;
        ecoDiscount = feeInfo.eco_modulation_discount || 0;
        
        // Apply the CORRECT formula: fee_cents_per_gram * grams * (1 - eco_modulation_discount)
        // Note: eco_modulation_discount is already a decimal (e.g., 0.15 for 15%), not a percentage
        feeCents = normalizedWeight * feeRate * (1 - ecoDiscount);
      }
    }
    
    // Ensure fee is a valid number
    if (isNaN(feeCents) || !isFinite(feeCents)) {
      feeCents = 0;
    }

    // Get additional info
    const product = this.products.find(p => p.sku_id === submission.sku_id);
    const vendor = this.vendors.find(v => v.vendor_id === submission.vendor_id);
    const isExempt = vendor?.exempt || false;

    // EXEMPTION LOGIC: Exempt vendors still have fees calculated, but retailer is not responsible
    // The fee calculation shows what the vendor owes, not what the retailer pays
    // This helps determine vendor vs retailer responsibility for EPR compliance

    // Add validation issues
    this.validationIssues.push(...issues);

    return {
      ...submission,
      normalized_weight_grams: normalizedWeight,
      fee_cents: feeCents,
      fee_rate_cents_per_gram: feeRate,
      eco_modulation_discount: ecoDiscount,
      is_exempt: isExempt
    };
  }

  getOverviewStats(): OverviewStats {
    const uniqueVendors = new Set(this.submissions.map(s => s.vendor_id)).size;
    const uniqueSkus = new Set(this.submissions.map(s => s.sku_id)).size;
    const totalFees = this.submissions.reduce((sum, s) => sum + s.fee_cents, 0);
    const errorRows = this.validationIssues.filter(i => i.severity === 'error').length;

    return {
      total_vendors: uniqueVendors,
      total_skus: uniqueSkus,
      total_fee_cents: totalFees,
      rows_with_errors: errorRows,
      total_submissions: this.submissions.length
    };
  }

  getTopSkusByFee(limit: number = 10): FeeSummary[] {
    const skuMap = new Map<string, FeeSummary>();

    this.submissions.forEach(submission => {
      const existing = skuMap.get(submission.sku_id);
      if (existing) {
        existing.total_grams += submission.normalized_weight_grams;
        existing.sku_total_cents += submission.fee_cents;
      } else {
        // Find product and vendor info from the reference data
        const product = this.products.find(p => p.sku_id === submission.sku_id);
        const vendor = this.vendors.find(v => v.vendor_id === submission.vendor_id);
        
        skuMap.set(submission.sku_id, {
          sku_id: submission.sku_id,
          sku_name: product?.sku_name || 'Unknown',
          vendor_id: submission.vendor_id,
          vendor_name: vendor?.vendor_name || 'Unknown',
          total_grams: submission.normalized_weight_grams,
          fee_per_gram_cents: submission.normalized_weight_grams > 0 
            ? submission.fee_cents / submission.normalized_weight_grams 
            : 0,
          sku_total_cents: submission.fee_cents,
          is_exempt: submission.is_exempt || false
        });
      }
    });

    return Array.from(skuMap.values())
      .sort((a, b) => b.sku_total_cents - a.sku_total_cents)
      .slice(0, limit);
  }

  getVendorTotals(): { vendor_id: string; vendor_name: string; total_fee_cents: number; total_grams: number; sku_count: number; is_exempt: boolean }[] {
    const vendorMap = new Map<string, { vendor_id: string; vendor_name: string; total_fee_cents: number; total_grams: number; sku_ids: string[]; is_exempt: boolean }>();

    this.submissions.forEach(submission => {
      const existing = vendorMap.get(submission.vendor_id);
      if (existing) {
        existing.total_fee_cents += submission.fee_cents;
        existing.total_grams += submission.normalized_weight_grams;
        if (!existing.sku_ids.includes(submission.sku_id)) {
          existing.sku_ids.push(submission.sku_id);
        }
      } else {
        // Find vendor info from the reference data
        const vendor = this.vendors.find(v => v.vendor_id === submission.vendor_id);
        
        vendorMap.set(submission.vendor_id, {
          vendor_id: submission.vendor_id,
          vendor_name: vendor?.vendor_name || 'Unknown',
          total_fee_cents: submission.fee_cents,
          total_grams: submission.normalized_weight_grams,
          sku_ids: [submission.sku_id],
          is_exempt: submission.is_exempt
        });
      }
    });

    return Array.from(vendorMap.values()).map(vendor => ({
      vendor_id: vendor.vendor_id,
      vendor_name: vendor.vendor_name,
      total_fee_cents: vendor.total_fee_cents,
      total_grams: vendor.total_grams,
      sku_count: vendor.sku_ids.length,
      is_exempt: vendor.is_exempt
    })).sort((a, b) => b.total_fee_cents - a.total_fee_cents);
  }

  getSubmissions(): ProcessedSubmission[] {
    return this.submissions;
  }

  getValidationIssues(): ValidationIssue[] {
    return this.validationIssues;
  }

  getMaterials(): Material[] {
    return this.materials;
  }

  getFees(): Fee[] {
    return this.fees;
  }

  getVendors(): Vendor[] {
    return this.vendors;
  }

  getProducts(): Product[] {
    return this.products;
  }

  // Method to add new submission (for the submission form)
  addSubmission(submission: VendorSubmission): void {
    const processed = this.processSubmission(submission, this.submissions.length + 1);
    if (processed) {
      this.submissions.push(processed);
    }
  }

  // Method to update submission (for admin review)
  updateSubmission(index: number, updates: Partial<ProcessedSubmission>): void {
    if (index >= 0 && index < this.submissions.length) {
      this.submissions[index] = { ...this.submissions[index], ...updates };
    }
  }
}

export const dataService = new DataService();
export default dataService;
