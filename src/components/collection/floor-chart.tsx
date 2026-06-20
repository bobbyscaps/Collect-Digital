"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface FloorChartProps {
  currentFloor: number;
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function FloorChart({ currentFloor }: FloorChartProps) {
  const data = DAYS.map((day, index) => ({
    day,
    floor: Math.max(0.05, currentFloor * (0.92 + index * 0.02)),
  }));

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
          <XAxis dataKey="day" />
          <YAxis domain={["dataMin - 0.1", "dataMax + 0.1"]} />
          <Tooltip />
          <Line type="monotone" dataKey="floor" stroke="#6366f1" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
