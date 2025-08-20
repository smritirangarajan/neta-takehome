export interface Material {
  material_name: string;
  category_group: string;
  recyclability_score: number;
  fee_cents_per_gram: number;
  eco_modulation_discount?: number;
}

export interface Fee {
  material_name: string;
  fee_cents_per_gram: number;
  eco_modulation_discount?: number;
}

export interface Vendor {
  vendor_id: string;
  vendor_name: string;
  exempt: boolean;
  contact_email: string;
  contact_phone: string;
}

export interface Product {
  sku_id: string;
  sku_name: string;
  category: string;
  vendor_id: string;
  unit_price: number;
}

export interface VendorSubmission {
  vendor_id: string;
  sku_id: string;
  component: string;
  material_name: string;
  material_category: string;
  weight_value: number;
  weight_unit: string;
  quantity_basis: 'unit' | 'case';
  case_size?: number;
  notes?: string;
}

export interface ProcessedSubmission extends VendorSubmission {
  normalized_weight_grams: number;
  fee_cents: number;
  is_exempt: boolean;
  fee_rate_cents_per_gram: number;
  eco_modulation_discount: number;
}

export interface ValidationIssue {
  row: number;
  field: string;
  message: string;
  severity: 'error' | 'warning';
  suggested_fix?: string;
}

export interface FeeSummary {
  sku_id: string;
  sku_name: string;
  vendor_id: string;
  vendor_name: string;
  total_grams: number;
  fee_per_gram_cents: number;
  sku_total_cents: number;
  is_exempt: boolean;
}

export interface OverviewStats {
  total_vendors: number;
  total_skus: number;
  total_fee_cents: number;
  rows_with_errors: number;
  total_submissions: number;
}

export interface VendorTotal {
  vendor_id: string;
  vendor_name: string;
  total_fee_cents: number;
  total_grams: number;
  sku_count: number;
  is_exempt: boolean;
} 
