import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';

vi.mock('axios', () => ({
  default: { post: vi.fn() }
}));

afterEach(() => cleanup());

describe('Sonic Downloader', () => {
  it('renders the application heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /sonic/i })).toBeInTheDocument();
  });

  it('switches between video and SoundCloud music modes', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: /music/i }));
    expect(screen.getByLabelText('SOUNDCLOUD TRACK URL')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /video/i }));
    expect(screen.getByLabelText('VIDEO SOURCE URL')).toBeInTheDocument();
  });
});
