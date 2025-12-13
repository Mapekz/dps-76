import * as React from 'react';

interface ThreeColumnLayoutProps {
  leftColumn: React.ReactNode;
  centerColumn: React.ReactNode;
  rightColumn: React.ReactNode;
  topContent?: React.ReactNode;
}

export function ThreeColumnLayout({ leftColumn, centerColumn, rightColumn, topContent }: ThreeColumnLayoutProps) {
  return (
    <div className="container mx-auto px-4 py-6">
      {topContent && <div className="mb-6">{topContent}</div>}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_auto_1fr]">
        <div className="min-w-0">{leftColumn}</div>
        <div className="flex items-start justify-center lg:min-w-[280px]">{centerColumn}</div>
        <div className="min-w-0">{rightColumn}</div>
      </div>
    </div>
  );
}
