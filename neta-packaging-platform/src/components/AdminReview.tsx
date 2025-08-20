import React, { useState, useEffect } from 'react';
import { dataService } from '../services/dataService';
import { ProcessedSubmission, ValidationIssue, Material, Vendor, Product } from '../types';
import { exportToCSV } from '../utils/csvExport';
import './AdminReview.css';

interface AdminReviewProps {
  onComplete?: () => void;
  onDataUpdate?: () => void;
}

const AdminReview: React.FC<AdminReviewProps> = ({ onComplete, onDataUpdate }) => {
  const [submissions, setSubmissions] = useState<ProcessedSubmission[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<ProcessedSubmission>>({});
  const [filterVendor, setFilterVendor] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      await dataService.loadAllData();
      setMaterials(dataService.getMaterials());
      setVendors(dataService.getVendors());
      setProducts(dataService.getProducts());
      
      // Get all submissions from data service
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

  const handleEdit = (submission: ProcessedSubmission) => {
    setEditingId(submission.sku_id + submission.material_name);
    setEditForm({
      vendor_id: submission.vendor_id,
      sku_id: submission.sku_id,
      component: submission.component,
      material_name: submission.material_name,
      material_category: submission.material_category,
      weight_value: submission.weight_value,
      weight_unit: submission.weight_unit,
      quantity_basis: submission.quantity_basis,
      case_size: submission.case_size,
      notes: submission.notes
    });
  };

  const handleSave = () => {
    if (editingId && editForm.vendor_id && editForm.sku_id && editForm.material_name) {
      // Find the submission index
      const submissionIndex = submissions.findIndex(s => 
        s.sku_id + s.material_name === editingId
      );
      
      if (submissionIndex >= 0) {
        // Update the submission in data service
        const updatedSubmission = {
          ...editForm,
          normalized_weight_grams: 0, // Will be recalculated
          fee_cents: 0, // Will be recalculated
          is_exempt: false, // Will be recalculated
          fee_rate_cents_per_gram: 0, // Will be recalculated
          eco_modulation_discount: 0 // Will be recalculated
        } as ProcessedSubmission;
        
        dataService.updateSubmission(submissionIndex, updatedSubmission);
        
        // Reload data to reflect changes
        loadData();
        
        // Clear edit form
        setEditingId(null);
        setEditForm({});
        
        // Notify parent component
        if (onDataUpdate) {
          onDataUpdate();
        }
      }
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditForm({});
  };

  const handleDelete = (submission: ProcessedSubmission) => {
    if (window.confirm('Are you sure you want to delete this submission?')) {
      // Remove from local state since dataService doesn't have deleteSubmission
      setSubmissions(prev => prev.filter(s => 
        !(s.sku_id === submission.sku_id && s.material_name === submission.material_name)
      ));
      
      if (onDataUpdate) {
        onDataUpdate();
      }
    }
  };

  const handleComplete = () => {
    if (onComplete) {
      onComplete();
    }
  };

  const filteredSubmissions = submissions.filter(submission => {
    const vendorMatch = filterVendor === 'all' || submission.vendor_id === filterVendor;
    const statusMatch = filterStatus === 'all' || 
      (filterStatus === 'valid' && submission.fee_cents > 0) ||
      (filterStatus === 'invalid' && submission.fee_cents === 0);
    
    return vendorMatch && statusMatch;
  });

  if (loading) {
    return (
      <div className="admin-review-loading">
        <div className="loading-spinner"></div>
        <p>Loading submissions for review...</p>
      </div>
    );
  }

  return (
    <div className="admin-review">
      <div className="review-header">
        <h2>Admin Review & Data Management</h2>
        <p>Review, edit, and manage vendor submissions for EPR compliance</p>
      </div>

      {/* Filters */}
      <div className="review-filters">
        <div className="filter-group">
          <label htmlFor="vendor-filter">Filter by Vendor:</label>
          <select
            id="vendor-filter"
            value={filterVendor}
            onChange={(e) => setFilterVendor(e.target.value)}
          >
            <option value="all">All Vendors</option>
            {vendors.map(vendor => (
              <option key={vendor.vendor_id} value={vendor.vendor_id}>
                {vendor.vendor_name}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="status-filter">Filter by Status:</label>
          <select
            id="status-filter"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="all">All Submissions</option>
            <option value="valid">Valid</option>
            <option value="invalid">Invalid</option>
          </select>
        </div>

        <div className="filter-actions">
          <button 
            className="action-btn primary"
            onClick={() => exportToCSV(filteredSubmissions, 'admin-review-submissions')}
          >
            📊 Export to CSV
          </button>
        </div>
      </div>

      {/* Submissions Table */}
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Vendor</th>
              <th>SKU</th>
              <th>Material</th>
              <th>Weight</th>
              <th>Fee</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredSubmissions.map((submission, index) => {
              const vendor = vendors.find(v => v.vendor_id === submission.vendor_id);
              const product = products.find(p => p.sku_id === submission.sku_id);
              const material = materials.find(m => m.material_name === submission.material_name);
              
              const isEditing = editingId === submission.sku_id + submission.material_name;
              
              return (
                <tr key={index} className={submission.fee_cents > 0 ? 'valid-row' : 'invalid-row'}>
                  <td>
                    {isEditing ? (
                      <select
                        value={editForm.vendor_id || ''}
                        onChange={(e) => setEditForm(prev => ({ ...prev, vendor_id: e.target.value }))}
                      >
                        {vendors.map(v => (
                          <option key={v.vendor_id} value={v.vendor_id}>
                            {v.vendor_name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div>
                        <div className="vendor-name">{vendor?.vendor_name || 'Unknown'}</div>
                        <div className="vendor-id">{submission.vendor_id}</div>
                      </div>
                    )}
                  </td>
                  
                  <td>
                    {isEditing ? (
                      <select
                        value={editForm.sku_id || ''}
                        onChange={(e) => setEditForm(prev => ({ ...prev, sku_id: e.target.value }))}
                      >
                        {products.map(p => (
                          <option key={p.sku_id} value={p.sku_id}>
                            {p.sku_name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div>
                        <div className="sku-name">{product?.sku_name || 'Unknown'}</div>
                        <div className="sku-id">{submission.sku_id}</div>
                      </div>
                    )}
                  </td>
                  
                  <td>
                    {isEditing ? (
                      <div>
                        <select
                          value={editForm.material_name || ''}
                          onChange={(e) => {
                            const material = materials.find(m => m.material_name === e.target.value);
                            setEditForm(prev => ({ 
                              ...prev, 
                              material_name: e.target.value,
                              material_category: material?.category_group || ''
                            }));
                          }}
                        >
                          {materials.map(m => (
                            <option key={m.material_name} value={m.material_name}>
                              {m.material_name}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={editForm.material_category || ''}
                          onChange={(e) => setEditForm(prev => ({ ...prev, material_category: e.target.value }))}
                          placeholder="Category"
                        />
                      </div>
                    ) : (
                      <div>
                        <div className="material-name">{submission.material_name}</div>
                        <div className="material-category">{submission.material_category}</div>
                      </div>
                    )}
                  </td>
                  
                  <td>
                    {isEditing ? (
                      <div>
                        <input
                          type="number"
                          value={editForm.weight_value || 0}
                          onChange={(e) => setEditForm(prev => ({ ...prev, weight_value: parseFloat(e.target.value) }))}
                          step="0.01"
                          min="0"
                        />
                        <select
                          value={editForm.weight_unit || 'grams'}
                          onChange={(e) => setEditForm(prev => ({ ...prev, weight_unit: e.target.value }))}
                        >
                          <option value="grams">g</option>
                          <option value="ounces">oz</option>
                          <option value="pounds">lbs</option>
                        </select>
                      </div>
                    ) : (
                      <div>
                        <div className="normalized-weight">{formatWeight(submission.normalized_weight_grams)}</div>
                        <div className="original-weight">
                          {submission.weight_value} {submission.weight_unit}
                          {submission.quantity_basis === 'case' && submission.case_size && ` (case of ${submission.case_size})`}
                        </div>
                      </div>
                    )}
                  </td>
                  
                  <td>
                                         <div className="fee-info">
                       <div className="fee-amount">{formatCurrency(submission.fee_cents)}</div>
                       <div className="fee-rate">{submission.fee_rate_cents_per_gram.toFixed(6)}¢/g</div>
                     </div>
                  </td>
                  
                  <td>
                    <span className={`status-badge ${submission.fee_cents > 0 ? 'valid' : 'error'}`}>
                      {submission.fee_cents > 0 ? 'Valid' : 'Invalid'}
                    </span>
                  </td>
                  
                  <td>
                    {isEditing ? (
                      <div className="edit-actions">
                        <button className="save-btn" onClick={handleSave}>Save</button>
                        <button className="cancel-btn" onClick={handleCancel}>Cancel</button>
                      </div>
                    ) : (
                      <div className="row-actions">
                        <button className="edit-btn" onClick={() => handleEdit(submission)}>Edit</button>
                        <button className="cancel-btn" onClick={() => handleDelete(submission)}>Delete</button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Summary and Actions */}
      <div className="review-summary">
        <div className="summary-stats">
          <div className="stat-item">
            <strong>Total Submissions:</strong> {filteredSubmissions.length}
          </div>
          <div className="stat-item">
            <strong>Valid:</strong> {filteredSubmissions.filter(s => s.fee_cents > 0).length}
          </div>
          <div className="stat-item">
            <strong>Invalid:</strong> {filteredSubmissions.filter(s => s.fee_cents === 0).length}
          </div>
        </div>
        
        <div className="review-actions">
          <button 
            className="action-btn primary"
            onClick={handleComplete}
            disabled={filteredSubmissions.filter(s => s.fee_cents === 0).length > 0}
          >
            Continue to Fee Simulation
          </button>
          <button className="action-btn secondary" onClick={loadData}>
            Refresh Data
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminReview; 
