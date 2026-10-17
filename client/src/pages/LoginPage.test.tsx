import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LoginPage } from './LoginPage';

const { signIn } = vi.hoisted(() => ({ signIn: vi.fn() }));
vi.mock('../state/useAuth', () => ({ useAuth: () => ({ signIn }) }));

describe('LoginPage', () => {
  it('shows inline email validation before submitting', async () => {
    render(<MemoryRouter><LoginPage /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'not-an-email' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in to workspace/i }));
    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
    expect(signIn).not.toHaveBeenCalled();
  });

  it('reveals and hides the password on request', async () => {
    render(<MemoryRouter><LoginPage /></MemoryRouter>);
    const password = screen.getByLabelText('Password');
    expect(password).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    await waitFor(() => expect(password).toHaveAttribute('type', 'text'));
  });
});
