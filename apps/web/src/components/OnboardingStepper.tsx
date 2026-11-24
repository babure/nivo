type Props = {
  steps: string[];
  /** zero-based index of the active step */
  current: number;
};

export function OnboardingStepper({ steps, current }: Props) {
  return (
    <nav aria-label="Onboarding progress">
      <p className="mb-3 text-sm font-medium text-charcoal-soft">
        Step {current + 1} of {steps.length}: <span className="text-charcoal">{steps[current]}</span>
      </p>
      <ol className="flex gap-2">
        {steps.map((label, i) => {
          const state = i < current ? "done" : i === current ? "current" : "todo";
          return (
            <li
              key={label}
              data-state={state}
              aria-current={state === "current" ? "step" : undefined}
              className="flex-1"
            >
              <span className="sr-only">
                {label} ({state})
              </span>
              <div
                className={`h-2 rounded-full ${
                  state === "done" ? "bg-orange" : state === "current" ? "bg-saffron" : "bg-charcoal/10"
                }`}
              />
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
