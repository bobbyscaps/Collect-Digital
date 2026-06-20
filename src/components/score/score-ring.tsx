interface ScoreRingProps {
  score: number;
  label?: string;
}

export function ScoreRing({ score, label }: ScoreRingProps) {
  const radius = 44;
  const stroke = 8;
  const normalizedScore = Math.max(0, Math.min(100, score));
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (normalizedScore / 100) * circumference;

  const color =
    normalizedScore >= 80
      ? "#22c55e"
      : normalizedScore >= 60
      ? "#eab308"
      : "#ef4444";

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={120} height={120} viewBox="0 0 120 120">
        <circle
          cx={60}
          cy={60}
          r={radius}
          stroke="hsl(var(--muted))"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={60}
          cy={60}
          r={radius}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 60 60)"
        />
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dy="0.3em"
          className="fill-foreground text-2xl font-semibold"
        >
          {Math.round(score)}
        </text>
      </svg>
      {label ? <p className="text-sm text-muted-foreground">{label}</p> : null}
    </div>
  );
}
