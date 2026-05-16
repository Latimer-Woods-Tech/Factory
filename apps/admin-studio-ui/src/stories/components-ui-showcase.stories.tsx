import type { Meta, StoryObj } from '@storybook/react';
import { useEffect, useState } from 'react';
import { EnvironmentBanner } from '../components/EnvironmentBanner';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useSession } from '../stores/session';

const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c2VyXzEiLCJ1c2VyRW1haWwiOiJvcGVyYXRvckBmYWN0b3J5LmRldiIsInJvbGUiOiJhZG1pbiJ9.signature';

const meta = {
  title: 'components/ui/Studio safeguards',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function Showcase() {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    useSession.setState({
      token,
      env: 'staging',
      user: { id: 'user_1', email: 'operator@factory.dev', role: 'admin' },
      expiresAt: Date.now() + 60 * 60 * 1000,
    });
  }, []);

  return (
    <div className="space-y-4">
      <EnvironmentBanner />
      <button
        className="rounded bg-emerald-700 hover:bg-emerald-600 px-3 py-1.5 text-sm text-white"
        onClick={() => setOpen(true)}
      >
        Open Confirm Dialog
      </button>
      <ConfirmDialog
        open={open}
        action="tests.dispatch"
        description="Run selected mobile smoke suites."
        reversibility="reversible"
        tier={2}
        onCancel={() => setOpen(false)}
        onConfirm={() => setOpen(false)}
      />
    </div>
  );
}

export const Light: Story = { render: () => <Showcase />, parameters: { mode: 'light' } };
export const Dark: Story = { render: () => <Showcase />, parameters: { mode: 'dark' } };
export const ReducedMotion: Story = { render: () => <Showcase />, parameters: { mode: 'reduced-motion' } };
export const RTL: Story = { render: () => <Showcase />, parameters: { mode: 'rtl' } };
