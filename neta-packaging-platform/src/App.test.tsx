import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders Neta packaging platform', () => {
  render(<App />);
  const headerElement = screen.getByText(/Neta Packaging Compliance Platform/i);
  expect(headerElement).toBeInTheDocument();
});
