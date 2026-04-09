'use client';

import { useState, useRef, useEffect } from 'react';
import { HelpCircle } from 'lucide-react';

interface HelpTooltipProps {
  text: string;
  size?: 'sm' | 'md';
  className?: string;
}

export default function HelpTooltip({ text, size = 'sm', className = '' }: HelpTooltipProps) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<'top' | 'bottom'>('top');
  const iconRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (visible && iconRef.current) {
      const rect = iconRef.current.getBoundingClientRect();
      // Show below if too close to top of viewport
      setPosition(rect.top < 120 ? 'bottom' : 'top');
    }
  }, [visible]);

  const iconSize = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';

  return (
    <span className={`relative inline-flex ${className}`}>
      <button
        ref={iconRef}
        type="button"
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        className="rounded-full p-0.5 text-zinc-600 transition-colors hover:text-zinc-400 focus:outline-none focus:text-zinc-400"
        aria-label="Help"
      >
        <HelpCircle className={iconSize} />
      </button>
      {visible && (
        <div
          ref={tooltipRef}
          role="tooltip"
          className="fixed z-[9999] w-60 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs leading-relaxed text-zinc-300 shadow-xl"
          style={{
            top: position === 'top'
              ? (iconRef.current?.getBoundingClientRect().top ?? 0) - 8
              : (iconRef.current?.getBoundingClientRect().bottom ?? 0) + 8,
            left: Math.max(8, Math.min(
              (iconRef.current?.getBoundingClientRect().left ?? 0) - 100,
              window.innerWidth - 260
            )),
            transform: position === 'top' ? 'translateY(-100%)' : undefined,
          }}
        >
          {text}
        </div>
      )}
    </span>
  );
}
