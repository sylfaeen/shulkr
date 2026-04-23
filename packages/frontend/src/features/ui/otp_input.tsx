import { type KeyboardEvent, type ClipboardEvent, type Ref, useRef, useCallback } from 'react';
import { cn } from '@shulkr/frontend/lib/cn';

export function OtpInput({
  value,
  length = 6,
  onChange,
  onComplete,
  error,
  disabled,
  ref,
}: {
  value: string;
  length?: number;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  error?: boolean;
  disabled?: boolean;
  ref?: Ref<HTMLDivElement>;
}) {
  const inputRef = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? '');
  const focusSlot = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(index, length - 1));
      inputRef.current[clamped]?.focus();
    },
    [length]
  );
  const updateValue = useCallback(
    (newValue: string) => {
      const cleaned = newValue.replace(/\D/g, '').slice(0, length);
      onChange(cleaned);
      if (cleaned.length === length) {
        onComplete?.(cleaned);
      }
    },
    [length, onChange, onComplete]
  );
  const handleInput = useCallback(
    (index: number, char: string) => {
      if (!/^\d$/.test(char)) return;
      const arr = digits.slice();
      arr[index] = char;
      const next = arr.join('');
      updateValue(next);
      if (index < length - 1) {
        focusSlot(index + 1);
      }
    },
    [digits, length, updateValue, focusSlot]
  );
  const handleKeyDown = useCallback(
    (index: number, e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Backspace') {
        e.preventDefault();
        const arr = digits.slice();
        if (arr[index] && arr[index] !== '') {
          arr[index] = '';
          updateValue(arr.join(''));
        } else if (index > 0) {
          arr[index - 1] = '';
          updateValue(arr.join(''));
          focusSlot(index - 1);
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        focusSlot(index - 1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        focusSlot(index + 1);
      } else if (/^\d$/.test(e.key)) {
        e.preventDefault();
        handleInput(index, e.key);
      }
    },
    [digits, updateValue, focusSlot, handleInput]
  );
  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault();
      const pasted = e.clipboardData.getData('text/plain').replace(/\D/g, '').slice(0, length);
      if (pasted.length > 0) {
        updateValue(pasted);
        focusSlot(Math.min(pasted.length, length - 1));
      }
    },
    [length, updateValue, focusSlot]
  );
  const half = Math.floor(length / 2);
  return (
    <div ref={ref} className={'flex items-center justify-center gap-1.5'}>
      {digits.map((digit, i) => (
        <div key={i} className={'contents'}>
          {i === half && (
            <div className={'mx-1 flex items-center'}>
              <span className={'text-lg font-medium text-zinc-300'}>-</span>
            </div>
          )}
          <input
            ref={(el) => {
              inputRef.current[i] = el;
            }}
            type={'text'}
            inputMode={'numeric'}
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            maxLength={1}
            value={digit === '' ? '' : digit}
            disabled={disabled}
            aria-label={`Digit ${i + 1} of ${length}`}
            onInput={(e) => {
              const target = e.target as HTMLInputElement;
              const char = target.value.slice(-1);
              if (/^\d$/.test(char)) {
                handleInput(i, char);
              }
              target.value = digit;
            }}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={handlePaste}
            onFocus={(e) => e.target.select()}
            className={cn(
              'font-jetbrains h-12 w-10 rounded-lg border bg-white text-center text-lg font-semibold text-zinc-900 caret-transparent outline-none',
              'transition-all duration-(--duration-fast)',
              'focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/20 focus:ring-offset-0',
              'disabled:cursor-not-allowed disabled:opacity-40',
              error
                ? 'border-red-600 focus:border-red-600 focus:ring-red-600/20'
                : digit
                  ? 'border-zinc-900/20'
                  : 'border-black/10 hover:border-black/12 dark:border-white/10 dark:hover:border-white/12'
            )}
          />
        </div>
      ))}
    </div>
  );
}
