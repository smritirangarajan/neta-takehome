import React, { useState, useEffect } from 'react';
import { dataService } from '../services/dataService';
import { OverviewStats, FeeSummary, VendorTotal } from '../types';
import { exportToCSV } from '../utils/csvExport';
import './OverviewDashboard.css';

interface OverviewDashboardProps {
  stats?: OverviewStats | null;
  topSkus?: FeeSummary[];
  vendorTotals?: VendorTotal[];
}

const OverviewDashboard: React.FC<OverviewDashboardProps> = ({ 
  stats: propStats, 
  topSkus: propTopSkus, 
  vendorTotals: propVendorTotals 
}) => {
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [topSkus, setTopSkus] = useState<FeeSummary[]>([]);
  const [vendorTotals, setVendorTotals] = useState<VendorTotal[]>([]);
  const [selectedVendor, setSelectedVendor] = useState<string>('all');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (propStats && propTopSkus && propVendorTotals) {
      // Use props if provided (from workflow)
      setStats(propStats);
      setTopSkus(propTopSkus);
      setVendorTotals(propVendorTotals);
    } else {
      // Fetch data if not provided
      loadDashboardData();
    }
  }, [propStats, propTopSkus, propVendorTotals]);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      await dataService.loadAllData();
      const dashboardStats = dataService.getOverviewStats();
      const dashboardTopSkus = dataService.getTopSkusByFee();
      const dashboardVendorTotals = dataService.getVendorTotals();
      
      setStats(dashboardStats);
      setTopSkus(dashboardTopSkus);
      setVendorTotals(dashboardVendorTotals);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
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

  const filteredTopSkus = selectedVendor === 'all' 
    ? topSkus 
    : topSkus.filter(sku => sku.vendor_id === selectedVendor);

  const filteredVendorTotals = selectedVendor === 'all' 
    ? vendorTotals 
    : vendorTotals.filter(vendor => vendor.vendor_id === selectedVendor);

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="loading-spinner"></div>
        <p>Loading compliance data...</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="no-data">
        <h3>No Data Available</h3>
        <p>Please upload vendor submissions to view compliance analytics.</p>
        <button className="action-btn primary" onClick={loadDashboardData}>
          Refresh Data
        </button>
      </div>
    );
  }

  return (
    <div className="overview-dashboard">
      <div className="dashboard-header">
        <h2>EPR Compliance Overview</h2>
        <p>Comprehensive packaging compliance analytics and fee summaries</p>
      </div>

      {/* Overview Cards */}
      <div className="overview-cards">
        <div className="overview-card">
          <div className="card-icon">🏢</div>
          <div className="card-content">
            <h3>Vendors</h3>
            <p className="card-value">{stats.total_vendors}</p>
            <p className="card-label">Active vendors</p>
          </div>
        </div>

        <div className="overview-card">
          <div className="card-icon">📦</div>
          <div className="card-content">
            <h3>SKUs</h3>
            <p className="card-value">{stats.total_skus}</p>
            <p className="card-label">Total products</p>
          </div>
        </div>

        <div className="overview-card">
          <div className="card-icon">💰</div>
          <div className="card-content">
            <h3>Total Fees</h3>
            <p className="card-value">{formatCurrency(stats.total_fee_cents)}</p>
            <p className="card-label">EPR compliance fees</p>
          </div>
        </div>

        <div className="overview-card">
          <div className="card-icon">⚠️</div>
          <div className="card-content">
            <h3>Errors</h3>
            <p className="card-value">{stats.rows_with_errors}</p>
            <p className="card-label">Validation issues</p>
          </div>
        </div>
      </div>

      {/* Vendor Filter */}
      <div className="vendor-filter">
        <label htmlFor="vendor-select">Filter by Vendor:</label>
        <select
          id="vendor-select"
          value={selectedVendor}
          onChange={(e) => setSelectedVendor(e.target.value)}
        >
          <option value="all">All Vendors</option>
          {vendorTotals.map(vendor => (
            <option key={vendor.vendor_id} value={vendor.vendor_id}>
              {vendor.vendor_name} ({vendor.vendor_id})
            </option>
          ))}
        </select>
      </div>

      {/* Top SKUs by Fee */}
      <div className="dashboard-section">
        <div className="section-header">
          <h3>Top SKUs by EPR Fees</h3>
          <button 
            className="export-btn"
            onClick={() => exportToCSV(filteredTopSkus, 'top-skus-by-fees')}
          >
            📊 Export to CSV
          </button>
        </div>
        
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>SKU ID</th>
                <th>SKU Name</th>
                <th>Vendor</th>
                <th>Total Weight</th>
                <th>Fee per Gram</th>
                <th>Total Fee</th>
                <th>Exemption Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredTopSkus.slice(0, 10).map((sku, index) => (
                <tr key={sku.sku_id}>
                  <td>{sku.sku_id}</td>
                  <td>{sku.sku_name}</td>
                  <td>{sku.vendor_name}</td>
                  <td>{formatWeight(sku.total_grams)}</td>
                  <td>{sku.fee_per_gram_cents.toFixed(6)}¢/g</td>
                  <td>{formatCurrency(sku.sku_total_cents)}</td>
                  <td>
                    <span className={`status-badge ${sku.is_exempt ? 'exempt' : 'liable'}`}>
                      {sku.is_exempt ? 'Exempt' : 'Liable'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Vendor Totals */}
      <div className="dashboard-section">
        <div className="section-header">
          <h3>Vendor Fee Totals</h3>
          <button 
            className="export-btn"
            onClick={() => exportToCSV(filteredVendorTotals, 'vendor-fee-totals')}
          >
            📊 Export to CSV
          </button>
        </div>
        
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Vendor ID</th>
                <th>Vendor Name</th>
                <th>Total Fee</th>
                <th>Total Weight</th>
                <th>SKU Count</th>
                <th>Exemption Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredVendorTotals.map(vendor => (
                <tr key={vendor.vendor_id}>
                  <td>{vendor.vendor_id}</td>
                  <td>{vendor.vendor_name}</td>
                  <td>{formatCurrency(vendor.total_fee_cents)}</td>
                  <td>{formatWeight(vendor.total_grams)}</td>
                  <td>{vendor.sku_count}</td>
                  <td>
                    <span className={`status-badge ${vendor.is_exempt ? 'exempt' : 'liable'}`}>
                      {vendor.is_exempt ? 'Exempt' : 'Liable'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Compliance Summary */}
      <div className="compliance-summary">
        <h3>EPR Compliance Summary</h3>
        <div className="summary-grid">
          <div className="summary-item">
            <strong>Total Submissions:</strong> {stats.total_submissions}
          </div>
          <div className="summary-item">
            <strong>Compliance Rate:</strong> {stats.total_submissions > 0 ? ((stats.total_submissions - stats.rows_with_errors) / stats.total_submissions * 100).toFixed(1) : 0}%
          </div>
          <div className="summary-item">
            <strong>Average Fee per SKU:</strong> {stats.total_skus > 0 ? formatCurrency(stats.total_fee_cents / stats.total_skus) : '0.00¢'}
          </div>
          <div className="summary-item">
            <strong>Total Weight:</strong> {formatWeight(vendorTotals.reduce((sum, vendor) => sum + vendor.total_grams, 0))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OverviewDashboard; 
