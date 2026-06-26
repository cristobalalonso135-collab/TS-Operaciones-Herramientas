'use client';

interface Step {
  id: number;
  name: string;
  description: string;
  active: boolean;
  completed: boolean;
}

interface StepIndicatorProps {
  steps: Step[];
  currentStep: number;
}

export default function StepIndicator({ steps, currentStep }: StepIndicatorProps) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-2">
      {steps.map((step, i) => (
        <div key={step.id} className="flex items-center">
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs whitespace-nowrap transition-colors
              ${step.id === currentStep
                ? 'bg-[var(--accent)] text-white'
                : step.completed
                  ? 'bg-[var(--success)]/10 text-[var(--success)] border border-[var(--success)]/30'
                  : 'bg-[var(--bg-card)] text-[var(--text-secondary)] border border-[var(--border)]'
              }`}
          >
            <span className="font-mono font-bold">{step.id}</span>
            <span>{step.name}</span>
          </div>
          {i < steps.length - 1 && (
            <div className="w-4 h-px bg-[var(--border)] mx-1" />
          )}
        </div>
      ))}
    </div>
  );
}
