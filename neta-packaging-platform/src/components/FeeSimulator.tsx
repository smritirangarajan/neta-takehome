import React, { useState, useEffect } from 'react';
import { dataService } from '../services/dataService';
import { ProcessedSubmission, Material, Fee, Vendor, Product } from '../types';
import { exportToCSV } from '../utils/csvExport';
import './FeeSimulator.css';

interface FeeSimulatorProps {
  onComplete?: () => void;
  onDataUpdate?: () => void;
}

const FeeSimulator: React.FC<FeeSimulatorProps> = ({ onComplete, onDataUpdate }) => {
  const [submissions, setSubmissions] = useState<ProcessedSubmission[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [fees, setFees] = useState<Fee[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedSubmission, setSelectedSubmission] = useState<ProcessedSubmission | null>(null);
  const [simulationParams, setSimulationParams] = useState({
    newMaterial: '',
    newWeight: 0,
    newWeightUnit: 'grams',
    newCaseSize: 1
  });
  const [simulationResults, setSimulationResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      await dataService.loadAllData();
      setMaterials(dataService.getMaterials());
      setFees(dataService.getFees());
      setVendors(dataService.getVendors());
      setProducts(dataService.getProducts());
      
      // Get submissions from data service
      const allSubmissions = dataService.getSubmissions();
      setSubmissions(allSubmissions);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatWeight = (grams: number | string | undefined): string => {
    if (grams === undefined || grams === null) return '0.00 g';
    const numGrams = parseFloat(String(grams || 0));
    if (isNaN(numGrams)) return '0.00 g';
    return `${numGrams.toFixed(2)} g`;
  };

  const formatCurrency = (cents: number): string => {
    return `${cents.toFixed(2)}¢`;
  };

  const handleSubmissionSelect = (submission: ProcessedSubmission) => {
    setSelectedSubmission(submission);
    setSimulationParams({
      newMaterial: submission.material_name,
      newWeight: submission.weight_value,
      newWeightUnit: submission.weight_unit,
      newCaseSize: submission.case_size || 1
    });
    setSimulationResults(null);
  };

  const runSimulation = () => {
    if (!selectedSubmission) return;

    const newMaterial = materials.find(m => m.material_name === simulationParams.newMaterial);
    const newFee = fees.find(f => f.material_name === simulationParams.newMaterial);
    
    if (!newMaterial || !newFee) {
      alert('Selected material not found in fee database');
      return;
    }

    // Calculate new weight in grams
    let newWeightGrams = simulationParams.newWeight;
    if (simulationParams.newWeightUnit === 'ounces') {
      newWeightGrams = simulationParams.newWeight * 28.35;
    } else if (simulationParams.newWeightUnit === 'pounds') {
      newWeightGrams = simulationParams.newWeight * 453.59;
    }

    // Handle case weights
    if (selectedSubmission.quantity_basis === 'case') {
      newWeightGrams = newWeightGrams / simulationParams.newCaseSize;
    }

    // Calculate new fee
    const newFeeCents = newWeightGrams * newFee.fee_cents_per_gram * (1 - (newFee.eco_modulation_discount || 0));

    // Calculate savings
    const currentFee = selectedSubmission.fee_cents;
    const feeDifference = newFeeCents - currentFee;
    const percentageChange = currentFee > 0 ? (feeDifference / currentFee) * 100 : 0;

    setSimulationResults({
      current: {
        material: selectedSubmission.material_name,
        weight: selectedSubmission.normalized_weight_grams,
        fee: currentFee,
        feeRate: selectedSubmission.fee_rate_cents_per_gram,
        ecoDiscount: selectedSubmission.eco_modulation_discount
      },
      simulated: {
        material: simulationParams.newMaterial,
        weight: newWeightGrams,
        fee: newFeeCents,
        feeRate: newFee.fee_cents_per_gram,
        ecoDiscount: newFee.eco_modulation_discount || 0
      },
      comparison: {
        feeDifference,
        percentageChange,
        weightDifference: newWeightGrams - selectedSubmission.normalized_weight_grams
      }
    });
  };

  const saveSubmissionEdit = () => {
    if (!selectedSubmission || !simulationResults) return;

    // Create updated submission
    const updatedSubmission: ProcessedSubmission = {
      ...selectedSubmission,
      material_name: simulationParams.newMaterial,
      material_category: materials.find(m => m.material_name === simulationParams.newMaterial)?.category_group || '',
      weight_value: simulationParams.newWeight,
      weight_unit: simulationParams.newWeightUnit,
      case_size: simulationParams.newCaseSize,
      normalized_weight_grams: simulationResults.simulated.weight,
      fee_cents: simulationResults.simulated.fee,
      fee_rate_cents_per_gram: simulationResults.simulated.feeRate,
      eco_modulation_discount: simulationResults.simulated.ecoDiscount
    };

    // Find the submission index and update in data service
    const submissionIndex = submissions.findIndex(s => 
      s.sku_id === selectedSubmission.sku_id && s.material_name === selectedSubmission.material_name
    );
    
    if (submissionIndex >= 0) {
      dataService.updateSubmission(submissionIndex, updatedSubmission);
    }
    
    // Reload data
    loadData();
    
    // Clear simulation
    setSelectedSubmission(null);
    setSimulationResults(null);
    
    // Notify parent component
    if (onDataUpdate) {
      onDataUpdate();
    }
  };

  const handleComplete = () => {
    if (onComplete) {
      onComplete();
    }
  };

  if (loading) {
    return (
      <div className="fee-simulator-loading">
        <div className="loading-spinner"></div>
        <p>Loading fee simulation data...</p>
      </div>
    );
  }

  return (
    <div className="fee-simulator">
      <div className="simulator-header">
        <h2>EPR Fee Simulation & Optimization</h2>
        <p>Model fee changes by modifying material and weight parameters</p>
      </div>

      <div className="simulator-content">
        <div className="submission-selection">
          <h3>Select Submission to Simulate</h3>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th>SKU</th>
                  <th>Current Material</th>
                  <th>Current Weight</th>
                  <th>Current Fee</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {submissions.slice(0, 10).map((submission, index) => {
                  const vendor = vendors.find(v => v.vendor_id === submission.vendor_id);
                  const product = products.find(p => p.sku_id === submission.sku_id);
                  
                  return (
                    <tr key={index} className={selectedSubmission?.sku_id === submission.sku_id ? 'selected-row' : ''}>
                      <td>
                        <div className="vendor-info">
                          <div className="vendor-name">{vendor?.vendor_name || 'Unknown'}</div>
                          <div className="vendor-id">{submission.vendor_id}</div>
                        </div>
                      </td>
                      <td>
                        <div className="sku-info">
                          <div className="sku-name">{product?.sku_name || 'Unknown'}</div>
                          <div className="sku-id">{submission.sku_id}</div>
                        </div>
                      </td>
                      <td>
                        <div className="material-info">
                          <div className="material-name">{submission.material_name}</div>
                          <div className="material-category">{submission.material_category}</div>
                        </div>
                      </td>
                      <td>
                        <div className="weight-info">
                          <div className="normalized-weight">{formatWeight(submission.normalized_weight_grams)}</div>
                          <div className="original-weight">
                            {submission.weight_value} {submission.weight_unit}
                            {submission.quantity_basis === 'case' && submission.case_size && ` (case of ${submission.case_size})`}
                          </div>
                        </div>
                      </td>
                      <td>
                                                 <div className="fee-info">
                           <div className="fee-amount">{formatCurrency(submission.fee_cents)}</div>
                           <div className="fee-rate">{submission.fee_rate_cents_per_gram.toFixed(6)}¢/g</div>
                         </div>
                      </td>
                      <td>
                        <button 
                          className="action-btn primary"
                          onClick={() => handleSubmissionSelect(submission)}
                        >
                          Simulate
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {selectedSubmission && (
          <div className="simulation-panel">
            <h3>Fee Simulation Parameters</h3>
            
            <div className="simulation-form">
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="new-material">New Material:</label>
                  <select
                    id="new-material"
                    value={simulationParams.newMaterial}
                    onChange={(e) => setSimulationParams(prev => ({ ...prev, newMaterial: e.target.value }))}
                  >
                    {materials.map(material => (
                      <option key={material.material_name} value={material.material_name}>
                        {material.material_name} ({material.category_group})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="new-weight">New Weight:</label>
                  <input
                    type="number"
                    id="new-weight"
                    value={simulationParams.newWeight}
                    onChange={(e) => setSimulationParams(prev => ({ ...prev, newWeight: parseFloat(e.target.value) }))}
                    step="0.01"
                    min="0"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="new-weight-unit">Weight Unit:</label>
                  <select
                    id="new-weight-unit"
                    value={simulationParams.newWeightUnit}
                    onChange={(e) => setSimulationParams(prev => ({ ...prev, newWeightUnit: e.target.value }))}
                  >
                    <option value="grams">Grams</option>
                    <option value="ounces">Ounces</option>
                    <option value="pounds">Pounds</option>
                  </select>
                </div>

                {selectedSubmission.quantity_basis === 'case' && (
                  <div className="form-group">
                    <label htmlFor="new-case-size">Case Size:</label>
                    <input
                      type="number"
                      id="new-case-size"
                      value={simulationParams.newCaseSize}
                      onChange={(e) => setSimulationParams(prev => ({ ...prev, newCaseSize: parseInt(e.target.value) }))}
                      min="1"
                    />
                  </div>
                )}
              </div>

              <div className="simulation-actions">
                <button 
                  className="action-btn primary"
                  onClick={runSimulation}
                >
                  Run Simulation
                </button>
                <button 
                  className="action-btn secondary"
                  onClick={() => {
                    setSelectedSubmission(null);
                    setSimulationResults(null);
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>

            {simulationResults && (
              <div className="simulation-results">
                <h4>Simulation Results</h4>
                
                <div className="results-comparison">
                  <div className="comparison-card current">
                    <h5>Current Configuration</h5>
                    <div className="result-item">
                      <strong>Material:</strong> {simulationResults.current.material}
                    </div>
                    <div className="result-item">
                      <strong>Weight:</strong> {formatWeight(simulationResults.current.weight)}
                    </div>
                                         <div className="result-item">
                       <strong>Fee Rate:</strong> {simulationResults.current.feeRate.toFixed(6)}¢/g
                     </div>
                    <div className="result-item">
                      <strong>Eco-Discount:</strong> {(simulationResults.current.ecoDiscount * 100).toFixed(2)}%
                    </div>
                    <div className="result-item total-fee">
                      <strong>Total Fee:</strong> {formatCurrency(simulationResults.current.fee)}
                    </div>
                  </div>

                  <div className="comparison-card simulated">
                    <h5>Simulated Configuration</h5>
                    <div className="result-item">
                      <strong>Material:</strong> {simulationResults.simulated.material}
                    </div>
                    <div className="result-item">
                      <strong>Weight:</strong> {formatWeight(simulationResults.simulated.weight)}
                    </div>
                                         <div className="result-item">
                       <strong>Fee Rate:</strong> {simulationResults.simulated.feeRate.toFixed(6)}¢/g
                     </div>
                    <div className="result-item">
                      <strong>Eco-Discount:</strong> {(simulationResults.simulated.ecoDiscount * 100).toFixed(2)}%
                    </div>
                    <div className="result-item total-fee">
                      <strong>Total Fee:</strong> {formatCurrency(simulationResults.simulated.fee)}
                    </div>
                  </div>
                </div>

                <div className="impact-analysis">
                  <h5>Impact Analysis</h5>
                  <div className="impact-grid">
                    <div className="impact-item">
                      <strong>Fee Change:</strong> 
                      <span className={`change ${simulationResults.comparison.feeDifference >= 0 ? 'increase' : 'decrease'}`}>
                        {simulationResults.comparison.feeDifference >= 0 ? '+' : ''}{formatCurrency(simulationResults.comparison.feeDifference)}
                      </span>
                    </div>
                    <div className="impact-item">
                      <strong>Percentage Change:</strong> 
                      <span className={`change ${simulationResults.comparison.percentageChange >= 0 ? 'increase' : 'decrease'}`}>
                        {simulationResults.comparison.percentageChange >= 0 ? '+' : ''}{simulationResults.comparison.percentageChange.toFixed(1)}%
                      </span>
                    </div>
                    <div className="impact-item">
                      <strong>Weight Change:</strong> 
                      <span className={`change ${simulationResults.comparison.weightDifference >= 0 ? 'increase' : 'decrease'}`}>
                        {simulationResults.comparison.weightDifference >= 0 ? '+' : ''}{formatWeight(simulationResults.comparison.weightDifference)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="simulation-actions">
                  <button 
                    className="action-btn primary"
                    onClick={saveSubmissionEdit}
                  >
                    Apply Changes
                  </button>
                  <button 
                    className="action-btn secondary"
                    onClick={() => setSimulationResults(null)}
                  >
                    Run Another Simulation
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Export and Continue */}
        <div className="simulator-actions">
          <button 
            className="action-btn primary"
            onClick={handleComplete}
            disabled={!selectedSubmission || !simulationResults}
          >
            Continue to Dashboard
          </button>
          <button 
            className="action-btn secondary"
            onClick={() => exportToCSV(submissions, 'fee-simulation-data')}
          >
            📊 Export to CSV
          </button>
        </div>
      </div>
    </div>
  );
};

export default FeeSimulator; 
