import React from 'react';
import WorkflowWizard from './components/WorkflowWizard';
import ErrorBoundary from './components/ErrorBoundary';
import './App.css';

function App() {
  return (
    <div className="App">
      <ErrorBoundary>
        <WorkflowWizard />
      </ErrorBoundary>
    </div>
  );
}

export default App;
