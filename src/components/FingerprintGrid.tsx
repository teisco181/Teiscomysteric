import React, { useState } from 'react';
import { FP_COLS, FP_ROWS } from '../types.ts';

interface FingerprintGridProps {
  matrix: number[];
  compareMatrix?: number[];
  editable?: boolean;
  brushMode?: 'ridge' | 'faint' | 'erase';
  onChange?: (next: number[]) => void;
  showCoordinates?: boolean;
  cellSize?: number;
  className?: string;
}

const COL_LABELS = 'ABCDEFGHIJKLMNOP'.split('');

export const FingerprintGrid: React.FC<FingerprintGridProps> = ({
  matrix,
  compareMatrix,
  editable = false,
  brushMode = 'ridge',
  onChange,
  showCoordinates = false,
  cellSize = 18,
  className = '',
}) => {
  const [isDrawing, setIsDrawing] = useState(false);

  const paintCell = (index: number) => {
    if (!editable || !onChange) return;
    const nextValue = brushMode === 'ridge' ? 1 : brushMode === 'faint' ? 2 : 0;
    if ((matrix[index] ?? 0) === nextValue) return;
    const copy = [...matrix];
    while (copy.length < FP_COLS * FP_ROWS) copy.push(0);
    copy[index] = nextValue;
    onChange(copy);
  };

  const getCellStyle = (idx: number): string => {
    const val = matrix[idx] ?? 0;

    if (compareMatrix) {
      const cmp = compareMatrix[idx] ?? 0;
      const hasA = val > 0;
      const hasB = cmp > 0;
      if (hasA && hasB) {
        return 'bg-emerald-500 dark:bg-emerald-400';
      }
      if (hasA && !hasB) {
        return 'bg-rose-500/85 dark:bg-rose-500/80';
      }
      if (!hasA && hasB) {
        return 'bg-sky-500/35 dark:bg-sky-400/30';
      }
      return 'bg-slate-100 dark:bg-[#0B1016]';
    }

    if (val === 1) {
      return 'bg-slate-900 dark:bg-emerald-400';
    }
    if (val === 2) {
      return 'bg-slate-400 dark:bg-emerald-500/45';
    }
    return 'bg-slate-100 dark:bg-[#0B1016]';
  };

  return (
    <div
      className={`inline-flex flex-col select-none ${className}`}
      onMouseLeave={() => setIsDrawing(false)}
      onMouseUp={() => setIsDrawing(false)}
    >
      {showCoordinates && (
        <div className="flex items-center mb-1">
          <div style={{ width: cellSize + 4 }} className="shrink-0" />
          <div
            className="grid gap-px font-mono text-[10px] text-slate-500 dark:text-slate-400 text-center"
            style={{ gridTemplateColumns: `repeat(${FP_COLS}, ${cellSize}px)` }}
          >
            {COL_LABELS.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
        </div>
      )}

      <div className="flex">
        {showCoordinates && (
          <div
            className="grid gap-px font-mono text-[10px] text-slate-500 dark:text-slate-400 pr-1 text-right"
            style={{
              gridTemplateRows: `repeat(${FP_ROWS}, ${cellSize}px)`,
              width: cellSize + 4,
            }}
          >
            {Array.from({ length: FP_ROWS }).map((_, r) => (
              <span key={r} className="leading-none flex items-center justify-end">
                {r + 1}
              </span>
            ))}
          </div>
        )}

        <div
          className={`grid gap-px p-1 rounded border border-slate-300 dark:border-slate-700/80 bg-slate-200 dark:bg-slate-800/70 ${
            editable ? 'cursor-crosshair' : ''
          }`}
          style={{
            gridTemplateColumns: `repeat(${FP_COLS}, ${cellSize}px)`,
            gridTemplateRows: `repeat(${FP_ROWS}, ${cellSize}px)`,
          }}
        >
          {Array.from({ length: FP_COLS * FP_ROWS }).map((_, idx) => (
            <button
              key={idx}
              type="button"
              disabled={!editable}
              aria-label={`Cel ${COL_LABELS[idx % FP_COLS]}${Math.floor(idx / FP_COLS) + 1}`}
              onMouseDown={() => {
                if (!editable) return;
                setIsDrawing(true);
                paintCell(idx);
              }}
              onMouseEnter={() => {
                if (editable && isDrawing) {
                  paintCell(idx);
                }
              }}
              onClick={() => {
                if (editable) paintCell(idx);
              }}
              className={`w-full h-full rounded-[1px] transition-colors duration-75 ${getCellStyle(
                idx
              )} ${editable ? 'hover:ring-1 hover:ring-emerald-400 focus:outline-none' : 'cursor-default'}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
