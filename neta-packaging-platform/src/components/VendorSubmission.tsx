import React, { useState, useEffect } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { dataService } from '../services/dataService';
import { VendorSubmission as VendorSubmissionType, Material, Fee, Vendor, Product } from '../types';
import { exportToCSV } from '../utils/csvExport';
import './VendorSubmission.css';

interface VendorSubmissionProps {
  onComplete?: () => void;
  onDataUpdate?: () => void;
}

const VendorSubmission: React.FC<VendorSubmissionProps> = ({ onComplete, onDataUpdate }) => {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [fees, setFees] = useState<Fee[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [fileData, setFileData] = useState<any[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [validationResults, setValidationResults] = useState<any[]>([]);
  const [uploadMethod, setUploadMethod] = useState<'file' | 'manual'>('file');
  const [manualSubmission, setManualSubmission] = useState<Partial<VendorSubmissionType>>({
    vendor_id: '',
    sku_id: '',
    component: '',
    material_name: '',
    material_category: '',
    weight_value: 0,
    weight_unit: 'grams',
    quantity_basis: 'unit',
    case_size: undefined,
    notes: ''
  });
  const [activePopup, setActivePopup] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      await dataService.loadAllData();
      setMaterials(dataService.getMaterials());
      setFees(dataService.getFees());
      setVendors(dataService.getVendors());
      setProducts(dataService.getProducts());
    };
    loadData();
  }, []);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    setUploadedFiles(files);
    let allData: any[] = [];

    const processFile = (file: File, index: number) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          let fileData: any[] = [];
          
          if (file.name.endsWith('.csv')) {
            const csvText = e.target?.result as string;
            const result = Papa.parse(csvText, { header: true });
            fileData = result.data;
          } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
            const arrayBuffer = e.target?.result as ArrayBuffer;
            const workbook = XLSX.read(arrayBuffer, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            fileData = XLSX.utils.sheet_to_json(sheet);
          }

          // Add file source information to each row
          fileData = fileData.map(row => ({
            ...row,
            source_file: file.name,
            file_index: index
          }));

          allData = [...allData, ...fileData];

          // If this is the last file, process all data
          if (index === files.length - 1) {
            setFileData(allData);
            validateFileData(allData);
          }
        } catch (error) {
          console.error(`Error parsing file ${file.name}:`, error);
          alert(`Error parsing file ${file.name}. Please check the format.`);
        }
      };

      if (file.name.endsWith('.csv')) {
        reader.readAsText(file);
      } else {
        reader.readAsArrayBuffer(file);
      }
    };

    // Process each file sequentially
    files.forEach((file, index) => {
      processFile(file, index);
    });
  };

  const validateFileData = (data: any[]) => {
    // Filter out empty rows and rows with no meaningful data
    const validRows = data.filter(row => 
      row && 
      (row.vendor_id || row.sku_id || row.material_name || row.weight_value) &&
      Object.keys(row).some(key => row[key] && row[key].toString().trim() !== '')
    );
    
    const results = validRows.map((row, index) => {
      const issues = [];
      const warnings = [];
      const details = {
        vendor_name: 'Unknown',
        sku_name: 'Unknown',
        is_exempt: false,
        normalized_weight_grams: 0,
        fee_cents_per_gram: 0,
        eco_modulation_discount: 0,
        calculated_fee_cents: 0
      };
      
      // Check required fields with detailed messages
      if (!row.vendor_id) {
        issues.push('Missing vendor_id - Required for EPR reporting');
      } else {
        const vendor = vendors.find(v => v.vendor_id === row.vendor_id);
        if (vendor) {
          details.vendor_name = vendor.vendor_name;
          details.is_exempt = vendor.exempt;
        } else {
          issues.push(`Invalid vendor_id: ${row.vendor_id} - Not found in vendor database`);
        }
      }
      
      if (!row.sku_id) {
        issues.push('Missing sku_id - Required for EPR reporting');
      } else {
        const product = products.find(p => p.sku_id === row.sku_id);
        if (product) {
          details.sku_name = product.sku_name;
        } else {
          issues.push(`Invalid sku_id: ${row.sku_id} - Not found in product database`);
        }
      }
      
      if (!row.material_name) {
        issues.push('Missing material_name - Required for EPR fee calculation');
      } else {
        const material = materials.find(m => 
          m.material_name.toLowerCase() === row.material_name?.toLowerCase()
        );
        if (material) {
          // Check category match for EPR compliance
          if (row.material_category && material.category_group !== row.material_category) {
            issues.push(`Category mismatch: "${row.material_category}" should be "${material.category_group}" for EPR reporting`);
          }
          
          // Get fee information for EPR compliance
          const fee = fees.find(f => 
            f.material_name.toLowerCase() === row.material_name?.toLowerCase()
          );
          if (fee) {
            details.fee_cents_per_gram = fee.fee_cents_per_gram;
            details.eco_modulation_discount = fee.eco_modulation_discount || 0;
            
            // Calculate fee using CORRECT formula: fee_cents_per_gram * grams * (1 - eco_modulation_discount)
            // Note: eco_modulation_discount is already a decimal (e.g., 0.15 for 15%), not a percentage
            if (details.normalized_weight_grams > 0) {
              details.calculated_fee_cents = details.normalized_weight_grams * details.fee_cents_per_gram * (1 - details.eco_modulation_discount);
            }
          }
        } else {
          issues.push(`Invalid material: "${row.material_name}" - Not found in EPR materials database. Suggested alternatives: ${materials.slice(0, 3).map(m => m.material_name).join(', ')}`);
        }
      }
      
      if (!row.weight_value || isNaN(parseFloat(row.weight_value))) {
        issues.push('Missing or invalid weight_value - Required for EPR fee calculation');
      } else {
        const weightValue = parseFloat(row.weight_value);
        if (weightValue <= 0) {
          issues.push('Weight value must be greater than 0');
        } else {
          // Weight normalization and EPR compliance checks
          let normalizedWeight = weightValue;
          
          if (row.weight_unit) {
            const unit = row.weight_unit.toLowerCase();
            if (unit === 'ounces' || unit === 'oz') {
              normalizedWeight = weightValue * 28.35; // oz to grams
            } else if (unit === 'pounds' || unit === 'lbs') {
              normalizedWeight = weightValue * 453.59; // lbs to grams
            } else if (unit === 'grams' || unit === 'g') {
              normalizedWeight = weightValue;
            } else {
              issues.push(`Invalid weight unit: "${row.weight_unit}". Supported units: grams (g), ounces (oz), pounds (lbs)`);
            }
          }
          
          // Handle case weights for EPR compliance
          if (row.quantity_basis === 'case' && row.case_size) {
            const caseSize = parseInt(row.case_size);
            if (caseSize > 0) {
              normalizedWeight = normalizedWeight / caseSize;
            } else {
              issues.push('Case size must be greater than 0 for case-based weights');
            }
          }
          
          details.normalized_weight_grams = normalizedWeight;
          
          // EPR-specific weight validation
          if (normalizedWeight > 300) {
            warnings.push(`Unusually high weight: ${normalizedWeight.toFixed(2)}g - Verify this is packaging weight, not product weight`);
          }
          
          if (normalizedWeight < 0.1) {
            warnings.push(`Very low weight: ${normalizedWeight.toFixed(2)}g - Verify accuracy for EPR reporting`);
          }
          
          // Calculate EPR fee
          if (details.fee_cents_per_gram > 0) {
            details.calculated_fee_cents = normalizedWeight * details.fee_cents_per_gram * (1 - details.eco_modulation_discount / 100);
          }
        }
      }
      
      // Additional EPR compliance checks
      if (row.notes && row.notes.length > 500) {
        warnings.push('Notes exceed 500 characters - Consider brevity for EPR reporting');
      }
      
      // Check for common EPR compliance issues
      if (row.material_name && row.material_name.toLowerCase().includes('product')) {
        warnings.push('Material name contains "product" - Verify this is packaging material, not product material');
      }
      
      if (row.weight_unit && !['grams', 'g', 'ounces', 'oz', 'pounds', 'lbs'].includes(row.weight_unit.toLowerCase())) {
        issues.push(`Unsupported weight unit: "${row.weight_unit}" - EPR reporting requires standard units`);
      }

      return {
        row: index + 1,
        originalData: row,
        details,
        issues,
        warnings,
        severity: issues.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'success',
        isValid: issues.length === 0,
        eprCompliant: issues.length === 0 && warnings.length === 0,
        suggestedFixes: generateSuggestedFixes(row, issues, warnings, materials, vendors, products)
      };
    });

    setValidationResults(results);
  };

  const handleManualSubmissionChange = (field: keyof VendorSubmissionType, value: any) => {
    setManualSubmission(prev => ({ ...prev, [field]: value }));
  };

  const handleManualSubmissionSubmit = () => {
    const submission = manualSubmission as VendorSubmissionType;
    if (submission.vendor_id && submission.sku_id && submission.material_name && submission.weight_value) {
      dataService.addSubmission(submission);
      alert('Submission added successfully!');
      setManualSubmission({
        vendor_id: '',
        sku_id: '',
        component: '',
        material_name: '',
        material_category: '',
        weight_value: 0,
        weight_unit: 'grams',
        quantity_basis: 'unit',
        case_size: undefined,
        notes: ''
      });
      
      // Notify parent component of completion
      if (onComplete) {
        onComplete();
      }
      if (onDataUpdate) {
        onDataUpdate();
      }
    } else {
      alert('Please fill in all required fields.');
    }
  };

  const generateSuggestedFixes = (row: any, issues: string[], warnings: string[], materials: Material[], vendors: Vendor[], products: Product[]) => {
    const fixes: string[] = [];
    
    // Generate specific fixes based on issues
    issues.forEach(issue => {
      if (issue.includes('Missing vendor_id')) {
        fixes.push('Add a valid vendor_id from the vendor database');
      } else if (issue.includes('Invalid vendor_id')) {
        fixes.push('Use a vendor_id that exists in the vendor database');
      } else if (issue.includes('Missing sku_id')) {
        fixes.push('Add a valid sku_id from the product database');
      } else if (issue.includes('Invalid sku_id')) {
        fixes.push('Use a sku_id that exists in the product database');
      } else if (issue.includes('Missing material_name')) {
        fixes.push('Add a material name from the EPR materials database');
      } else if (issue.includes('Invalid material')) {
        const suggestions = materials.slice(0, 3).map(m => m.material_name).join(', ');
        fixes.push(`Use one of these valid materials: ${suggestions}`);
      } else if (issue.includes('Category mismatch')) {
        const material = materials.find(m => m.material_name.toLowerCase() === row.material_name?.toLowerCase());
        if (material) {
          fixes.push(`Change material_category to "${material.category_group}"`);
        }
      } else if (issue.includes('Missing weight_value')) {
        fixes.push('Add the packaging weight value (not product weight)');
      } else if (issue.includes('Invalid weight unit')) {
        fixes.push('Use standard units: grams (g), ounces (oz), or pounds (lbs)');
      } else if (issue.includes('Case size')) {
        fixes.push('Ensure case_size is a positive number for case-based weights');
      }
    });
    
    // Generate suggestions for warnings
    warnings.forEach(warning => {
      if (warning.includes('Unusually high weight')) {
        fixes.push('Verify this is packaging weight, not product weight. Consider splitting into components if >300g');
      } else if (warning.includes('Very low weight')) {
        fixes.push('Verify weight accuracy. Consider using more precise measurement units');
      } else if (warning.includes('Notes exceed')) {
        fixes.push('Keep notes under 500 characters for EPR reporting');
      } else if (warning.includes('contains "product"')) {
        fixes.push('Ensure material name refers to packaging, not the product itself');
      }
    });
    
    return fixes;
  };

  const handleBulkSubmit = () => {
    // Include ALL data - both valid and those with warnings (only exclude rows with errors)
    const dataToSubmit = fileData.filter((_, index) => 
      validationResults[index]?.severity !== 'error'
    );
    
    if (dataToSubmit.length === 0) {
      alert('No data to submit. All rows have errors.');
      return;
    }

    // Clear existing submissions first to avoid duplicates
    dataService.clearSubmissions();
    
    // Add all submissions (valid + warnings)
    dataToSubmit.forEach(row => {
      dataService.addSubmission(row);
    });

    // Automatically advance to next step - no need for manual "Next" button
    if (onComplete) {
      onComplete();
    }
    if (onDataUpdate) {
      onDataUpdate();
    }
  };



  return (
    <div className="vendor-submission">
      <div className="submission-header">
        <h2>Vendor Data Submission</h2>
        <p>Upload CSV/Excel files or manually enter packaging data</p>
      </div>

      <div className="submission-tabs">
        <button 
          className={`tab-btn ${uploadMethod === 'file' ? 'active' : ''}`}
          onClick={() => setUploadMethod('file')}
        >
          File Upload
        </button>
        <button 
          className={`tab-btn ${uploadMethod === 'manual' ? 'active' : ''}`}
          onClick={() => setUploadMethod('manual')}
        >
          Manual Entry
        </button>
      </div>

      {uploadMethod === 'file' && (
        <div className="file-upload-section">
          <div className="upload-area">
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileUpload}
              id="file-upload"
              className="file-input"
              multiple
            />
            <label htmlFor="file-upload" className="file-label">
              <div className="upload-icon">📁</div>
              <p>Click to upload CSV or Excel files</p>
              <p className="upload-hint">Supports multiple .csv, .xlsx, .xls files</p>
            </label>
          </div>

          {uploadedFiles.length > 0 && (
            <div className="uploaded-files">
              <h4>Uploaded Files:</h4>
              <div className="file-list">
                {uploadedFiles.map((file, index) => (
                  <div key={index} className="file-item">
                    <span className="file-name">{file.name}</span>
                    <span className="file-size">({(file.size / 1024).toFixed(1)} KB)</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {fileData.length > 0 && (
            <div className="validation-results">
              <div className="section-header">
                <h3>EPR Compliance Validation Results</h3>
                <div className="header-actions">
                  <button 
                    className="export-btn"
                    onClick={() => exportToCSV(validationResults, 'validation-results')}
                    disabled={validationResults.length === 0}
                  >
                    📊 Export All Results
                  </button>
                  <button 
                    className="export-btn secondary"
                    onClick={() => exportToCSV(validationResults.filter(r => r.isValid), 'valid-records-only')}
                    disabled={validationResults.filter(r => r.isValid).length === 0}
                  >
                    📊 Export Valid Results
                  </button>
                  <button 
                    className="export-btn error"
                    onClick={() => exportToCSV(validationResults.filter(r => r.severity === 'error'), 'error-results-only')}
                    disabled={validationResults.filter(r => r.severity === 'error').length === 0}
                  >
                    📊 Export Error Results
                  </button>
                </div>
              </div>
              <div className="validation-summary">
                <div className="summary-card">
                  <span className="summary-label">Total Rows:</span>
                  <span className="summary-value">{validationResults.length}</span>
                </div>
                <div className="summary-card">
                  <span className="summary-label">EPR Compliant:</span>
                  <span className="summary-value success">✅ {validationResults.filter(r => r.eprCompliant).length}</span>
                </div>
                <div className="summary-card">
                  <span className="summary-label">With Errors:</span>
                  <span className="summary-value error">❌ {validationResults.filter(r => r.severity === 'error').length}</span>
                </div>
                <div className="summary-card">
                  <span className="summary-label">With Warnings:</span>
                  <span className="summary-value warning">⚠️ {validationResults.filter(r => r.severity === 'warning').length}</span>
                </div>
              </div>
              
              <div className="table-container">
                <table className="validation-table">
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>File</th>
                      <th>Vendor</th>
                      <th>SKU</th>
                      <th>Material</th>
                      <th>Weight (g)</th>
                      <th>Fee Rate</th>
                      <th>Calculated Fee</th>
                      <th>EPR Status</th>
                      <th>Issues & Warnings</th>
                      <th>Suggested Fixes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validationResults.map((result, index) => (
                      <tr key={index} className={`validation-row ${result.severity}`}>
                        <td>{result.row}</td>
                        <td className="file-source">
                          <div className="file-name">{result.originalData.source_file}</div>
                          <div className="file-index">File {result.originalData.file_index + 1}</div>
                        </td>
                        <td>
                          <div className="vendor-info">
                            <div className="vendor-name">{result.details.vendor_name}</div>
                            <div className={`exemption-status ${result.details.is_exempt ? 'exempt' : 'not-exempt'}`}>
                              {result.details.is_exempt ? 'Exempt' : 'Not Exempt'}
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="sku-info">
                            <div className="sku-id">{result.originalData.sku_id}</div>
                            <div className="sku-name">{result.details.sku_name}</div>
                          </div>
                        </td>
                        <td>
                          <div className="material-info">
                            <div className="material-name">{result.originalData.material_name}</div>
                            <div className="material-category">{result.originalData.material_category}</div>
                          </div>
                        </td>
                        <td>
                          <div className="weight-info">
                            <div className="normalized-weight">{result.details.normalized_weight_grams.toFixed(2)}g</div>
                            <div className="original-weight">
                              {result.originalData.weight_value} {result.originalData.weight_unit}
                              {result.originalData.quantity_basis === 'case' && ` (case of ${result.originalData.case_size})`}
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="fee-info">
                            <div className="fee-rate">{result.details.fee_cents_per_gram.toFixed(6)}¢/g</div>
                            {result.details.eco_modulation_discount > 0 && (
                              <div className="eco-discount">{(result.details.eco_modulation_discount * 100).toFixed(2)}% off</div>
                            )}
                          </div>
                        </td>
                        <td>
                          <div className="calculated-fee">
                            {result.details.calculated_fee_cents.toFixed(6)}¢
                          </div>
                        </td>
                        <td>
                          <span className={`epr-status-badge ${result.eprCompliant ? 'compliant' : 'non-compliant'}`}>
                            {result.eprCompliant ? 'Compliant' : 'Non-Compliant'}
                          </span>
                          {!result.eprCompliant && (
                            <div className="compliance-details">
                              <small>Has {result.issues.length} error(s), {result.warnings.length} warning(s)</small>
                            </div>
                          )}
                        </td>
                        <td className="issues-cell">
                          <div className="issues-buttons">
                            {result.issues.length > 0 && (
                              <button 
                                className="issue-btn error-btn"
                                onClick={() => setActivePopup(`errors-${index}`)}
                              >
                                ❌ {result.issues.length} Error{result.issues.length > 1 ? 's' : ''}
                              </button>
                            )}
                            {result.warnings.length > 0 && (
                              <button 
                                className="issue-btn warning-btn"
                                onClick={() => setActivePopup(`warnings-${index}`)}
                              >
                                ⚠️ {result.warnings.length} Warning{result.warnings.length > 1 ? 's' : ''}
                              </button>
                            )}
                            {result.issues.length === 0 && result.warnings.length === 0 && (
                              <span className="no-issues success">✓ EPR Compliant</span>
                            )}
                          </div>
                          
                          {/* Error Popup */}
                          {activePopup === `errors-${index}` && (
                            <div className="popup-overlay" onClick={() => setActivePopup(null)}>
                              <div className="popup-content error-popup" onClick={(e) => e.stopPropagation()}>
                                <div className="popup-header">
                                  <h4>❌ Errors (Row {result.row})</h4>
                                  <button className="close-btn" onClick={() => setActivePopup(null)}>×</button>
                                </div>
                                <div className="popup-body">
                                  <ul className="popup-issues-list">
                                    {result.issues.map((issue: string, i: number) => (
                                      <li key={i} className="popup-issue-item">{issue}</li>
                                    ))}
                                  </ul>
                                </div>
                              </div>
                            </div>
                          )}
                          
                          {/* Warning Popup */}
                          {activePopup === `warnings-${index}` && (
                            <div className="popup-overlay" onClick={() => setActivePopup(null)}>
                              <div className="popup-content warning-popup" onClick={(e) => e.stopPropagation()}>
                                <div className="popup-header">
                                  <h4>⚠️ Warnings (Row {result.row})</h4>
                                  <button className="close-btn" onClick={() => setActivePopup(null)}>×</button>
                                </div>
                                <div className="popup-body">
                                  <ul className="popup-issues-list">
                                    {result.warnings.map((warning: string, i: number) => (
                                      <li key={i} className="popup-issue-item">{warning}</li>
                                    ))}
                                  </ul>
                                </div>
                              </div>
                            </div>
                          )}
                        </td>
                                                <td>
                          {result.suggestedFixes.length > 0 ? (
                            <ul className="suggested-fixes">
                              {result.suggestedFixes.map((fix: string, i: number) => (
                                <li key={i} className="fix-item">{fix}</li>
                              ))}
                            </ul>
                          ) : result.eprCompliant ? (
                            <span className="no-fixes success">✓ No fixes needed</span>
                          ) : (
                            <span className="no-fixes error">⚠️ Fix errors first</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="epr-compliance-notes">
                <h4>EPR Compliance Notes:</h4>
                <ul>
                  <li><strong>Errors</strong> must be fixed before EPR submission</li>
                  <li><strong>Warnings</strong> should be reviewed but don't block submission</li>
                  <li>All weights are normalized to grams for EPR reporting</li>
                  <li><strong>Fee Calculation</strong>: fee_cents_per_gram × grams × (1 - eco_modulation_discount)</li>
                  <li><strong>Eco-modulation Assumption</strong>: Discounts are stored as decimals (0.15 = 15% off) per fees.csv</li>
                  <li><strong>Exempt Vendors</strong>: Still have fees calculated, but retailer is not responsible for payment</li>
                  <li>Vendor exemption status affects EPR responsibility</li>
                </ul>
                
                <div className="exemption-explanation">
                  <h5>Exemption Status Explanation:</h5>
                  <ul>
                    <li><strong>Exempt</strong>: Vendor is responsible for paying EPR fees. Retailer does not pay.</li>
                    <li><strong>Not Exempt (Liable)</strong>: Retailer is responsible for paying EPR fees. Vendor does not pay.</li>
                    <li><strong>Note</strong>: All fees are calculated for compliance reporting, but responsibility determines who pays.</li>
                  </ul>
                </div>

                <div className="eco-modulation-assumption">
                  <h5>Eco-Modulation Assumption:</h5>
                  <p><strong>Important:</strong> This application uses <code>fees.csv</code> as the <strong>sole source of truth</strong> for all fee rates and eco-modulation discounts. The eco-modulation discounts in this file are stored as decimal values (e.g., 0.15 = 15% discount) and are applied directly in the fee calculation formula:</p>
                  <div className="formula">
                    <strong>Fee = fee_cents_per_gram × grams × (1 - eco_modulation_discount)</strong>
                  </div>
                  <p>This approach ensures consistent fee calculations across all vendor submissions and eliminates the need for percentage conversions that could introduce rounding errors.</p>
                </div>
              </div>
              
              <div className="bulk-actions">
                <button 
                  className="submit-btn primary"
                  onClick={handleBulkSubmit}
                  disabled={validationResults.filter(r => r.isValid).length === 0}
                >
                  Submit Valid Data & Continue
                </button>
                <button className="submit-btn secondary" onClick={() => {
                  setFileData([]);
                  setValidationResults([]);
                }}>
                  Clear Data
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {uploadMethod === 'manual' && (
        <div className="manual-entry-section">
          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="vendor_id">Vendor ID *</label>
              <select
                id="vendor_id"
                value={manualSubmission.vendor_id}
                onChange={(e) => handleManualSubmissionChange('vendor_id', e.target.value)}
                required
              >
                <option value="">Select Vendor</option>
                {vendors.map(vendor => (
                  <option key={vendor.vendor_id} value={vendor.vendor_id}>
                    {vendor.vendor_name} ({vendor.vendor_id})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="sku_id">SKU ID *</label>
              <select
                id="sku_id"
                value={manualSubmission.sku_id}
                onChange={(e) => handleManualSubmissionChange('sku_id', e.target.value)}
                required
              >
                <option value="">Select SKU</option>
                {products.map(product => (
                  <option key={product.sku_id} value={product.sku_id}>
                    {product.sku_name} ({product.sku_id})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="component">Component</label>
              <input
                type="text"
                id="component"
                value={manualSubmission.component}
                onChange={(e) => handleManualSubmissionChange('component', e.target.value)}
                placeholder="e.g., Primary packaging, Label"
              />
            </div>

            <div className="form-group">
              <label htmlFor="material_name">Material Name *</label>
              <select
                id="material_name"
                value={manualSubmission.material_name}
                onChange={(e) => {
                  const material = materials.find(m => m.material_name === e.target.value);
                  handleManualSubmissionChange('material_name', e.target.value);
                  if (material) {
                    handleManualSubmissionChange('material_category', material.category_group);
                  }
                }}
                required
              >
                <option value="">Select Material</option>
                {materials.map(material => (
                  <option key={material.material_name} value={material.material_name}>
                    {material.material_name} ({material.category_group})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="weight_value">Weight Value *</label>
              <input
                type="number"
                id="weight_value"
                value={manualSubmission.weight_value}
                onChange={(e) => handleManualSubmissionChange('weight_value', parseFloat(e.target.value))}
                step="0.01"
                min="0"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="weight_unit">Weight Unit *</label>
              <select
                id="weight_unit"
                value={manualSubmission.weight_unit}
                onChange={(e) => handleManualSubmissionChange('weight_unit', e.target.value)}
                required
              >
                <option value="grams">Grams</option>
                <option value="ounces">Ounces</option>
                <option value="pounds">Pounds</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="quantity_basis">Quantity Basis</label>
              <select
                id="quantity_basis"
                value={manualSubmission.quantity_basis}
                onChange={(e) => handleManualSubmissionChange('quantity_basis', e.target.value as 'unit' | 'case')}
              >
                <option value="unit">Per Unit</option>
                <option value="case">Per Case</option>
              </select>
            </div>

            {manualSubmission.quantity_basis === 'case' && (
              <div className="form-group">
                <label htmlFor="case_size">Case Size</label>
                <input
                  type="number"
                  id="case_size"
                  value={manualSubmission.case_size || ''}
                  onChange={(e) => handleManualSubmissionChange('case_size', parseInt(e.target.value))}
                  min="1"
                  placeholder="Number of units per case"
                />
              </div>
            )}

            <div className="form-group full-width">
              <label htmlFor="notes">Notes</label>
              <textarea
                id="notes"
                value={manualSubmission.notes || ''}
                onChange={(e) => handleManualSubmissionChange('notes', e.target.value)}
                placeholder="Additional notes or comments"
                rows={3}
              />
            </div>
          </div>

          <div className="form-actions">
            <button 
              className="submit-btn primary"
              onClick={handleManualSubmissionSubmit}
            >
              Submit Entry
            </button>
            <button 
              className="submit-btn secondary"
              onClick={() => setManualSubmission({
                vendor_id: '',
                sku_id: '',
                component: '',
                material_name: '',
                material_category: '',
                weight_value: 0,
                weight_unit: 'grams',
                quantity_basis: 'unit',
                case_size: undefined,
                notes: ''
              })}
            >
              Clear Form
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default VendorSubmission;
