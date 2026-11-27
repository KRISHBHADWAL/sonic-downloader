import { render, screen } from '@testing-library/react';
import App from './App';

// CRA's bundled Jest runtime does not transform Axios 1.x ESM in node_modules.
jest.mock('axios', () => ({
  __esModule: true,
  default: { post: jest.fn() }
}));

test('renders the Sonic Downloader heading', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: /sonic/i })).toBeInTheDocument();
});
