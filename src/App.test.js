import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from './App';

vi.mock('axios', () => ({
  default: { post: vi.fn() }
}));

describe('Sonic Downloader', () => {
  it('renders the application heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /sonic/i })).toBeInTheDocument();
  });
});
