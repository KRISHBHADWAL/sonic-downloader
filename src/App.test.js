import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the Sonic Downloader heading', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: /sonic/i })).toBeInTheDocument();
});
