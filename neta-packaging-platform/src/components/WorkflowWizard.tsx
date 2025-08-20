import React, { useState, useEffect } from 'react';
import VendorSubmission from './VendorSubmission';
import AdminReview from './AdminReview';
import FeeSimulator from './FeeSimulator';
import OverviewDashboard from './OverviewDashboard';
import { dataService } from '../services/dataService';
import { OverviewStats, FeeSummary, VendorTotal } from '../types';
import './WorkflowWizard.css';

interface WorkflowStep {
  id: string;
  title: string;
  description: string;
  component: React.ComponentType<any>;
  completed: boolean;
}

interface WorkflowData {
  filesUploaded: boolean;
  reviewCompleted: boolean;
  simulationDone: boolean;
}

const WorkflowWizard: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [workflowData, setWorkflowData] = useState<WorkflowData>({
    filesUploaded: false,
    reviewCompleted: false,
    simulationDone: false
  });
  const [dashboardData, setDashboardData] = useState<{
    stats: OverviewStats | null;
    topSkus: FeeSummary[];
    vendorTotals: VendorTotal[];
  }>({
    stats: null,
    topSkus: [],
    vendorTotals: []
  });

  useEffect(() => {
    const loadInitialData = async () => {
      await dataService.loadAllData();
      updateDashboardData();
    };
    loadInitialData();
  }, []);

  const updateDashboardData = () => {
    const stats = dataService.getOverviewStats();
    const topSkus = dataService.getTopSkusByFee();
    const vendorTotals = dataService.getVendorTotals();
    
    setDashboardData({ stats, topSkus, vendorTotals });
  };

  const handleStepComplete = (stepId: string) => {
    setWorkflowData(prev => ({
      ...prev,
      [stepId]: true
    }));
    
    // Automatically advance to next step
    setCurrentStep(currentStep + 1);
    
    // Update dashboard data when relevant steps are completed
    if (stepId === 'filesUploaded' || stepId === 'reviewCompleted') {
      updateDashboardData();
    }
  };

  const handleNextStep = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePreviousStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleStepClick = (stepIndex: number) => {
    if (stepIndex <= currentStep || steps[stepIndex].completed) {
      setCurrentStep(stepIndex);
    }
  };

  const canProceedFromCurrentStep = () => {
    if (currentStep === 0) return false; // First step uses "Submit Valid Data & Continue"
    return currentStep < steps.length - 1;
  };

  const steps: WorkflowStep[] = [
    {
      id: 'filesUploaded',
      title: '1. Upload Data',
      description: 'Upload vendor submission files and validate EPR compliance',
      component: VendorSubmission,
      completed: workflowData.filesUploaded
    },
    {
      id: 'reviewCompleted',
      title: '2. Admin Review',
      description: 'Review and edit vendor submissions',
      component: AdminReview,
      completed: workflowData.reviewCompleted
    },
    {
      id: 'simulationDone',
      title: '3. Fee Simulation',
      description: 'Model fee changes and compare scenarios',
      component: FeeSimulator,
      completed: workflowData.simulationDone
    },
    {
      id: 'dashboard',
      title: '4. Dashboard',
      description: 'View compliance overview and analytics',
      component: OverviewDashboard,
      completed: workflowData.simulationDone
    }
  ];

  const CurrentStepComponent = steps[currentStep].component;

  return (
    <div className="workflow-wizard">
      <div className="wizard-header">
        <h1>Neta Packaging Compliance Platform</h1>
        <p>Streamlined EPR compliance workflow for multi-vendor grocery retailers</p>
      </div>

      <div className="wizard-progress">
        {steps.map((step, index) => (
          <div
            key={step.id}
            className={`progress-step ${index === currentStep ? 'active' : ''} ${step.completed ? 'completed' : ''}`}
            onClick={() => handleStepClick(index)}
          >
            <div className="step-number">{index + 1}</div>
            <div className="step-info">
              <h4>{step.title}</h4>
              <p>{step.description}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="wizard-content">
        <div className="step-header">
          <h2>{steps[currentStep].title}</h2>
          <p>{steps[currentStep].description}</p>
        </div>

        <div className="step-content">
          <CurrentStepComponent
            onComplete={() => handleStepComplete(steps[currentStep].id)}
            onDataUpdate={updateDashboardData}
            stats={dashboardData.stats}
            topSkus={dashboardData.topSkus}
            vendorTotals={dashboardData.vendorTotals}
          />
        </div>

        <div className="wizard-navigation">
          {currentStep > 0 && (
            <button className="nav-btn secondary" onClick={handlePreviousStep}>
              ← Previous Step
            </button>
          )}
          
          {canProceedFromCurrentStep() && (
            <button className="nav-btn primary" onClick={handleNextStep}>
              Next Step →
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default WorkflowWizard; 
