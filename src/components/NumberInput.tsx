import { useEffect, useState, type InputHTMLAttributes } from "react";

/**
 * A number box that can be emptied.
 *
 * The usual wiring — `value={n}` with `onChange={e => set(Number(e.target.value))}`
 * — turns an empty box into 0 on the very keystroke that empties it, so the
 * old value can never be cleared away before typing a new one. In the cart it
 * was worse: 0 means "remove", so clearing a quantity deleted the item.
 *
 * Here the text being typed is held locally. The parent only ever hears a
 * real number; an empty box is either reported through `onClear`, for fields
 * where empty means something ("auto", "not set"), or simply not reported, and
 * the last good value comes back when the box loses focus.
 */
type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange" | "defaultValue"
> & {
  value: number | string | null | undefined;
  onValueChange: (value: number) => void;
  /** Called when the box is emptied. Without it, empty is temporary. */
  onClear?: () => void;
};

const toText = (value: Props["value"]) =>
  value === null || value === undefined || value === "" ? "" : String(value);

const parse = (text: string): number | null => {
  if (text.trim() === "") return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
};

export function NumberInput({
  value,
  onValueChange,
  onClear,
  onBlur,
  onFocus,
  onWheel,
  ...rest
}: Props) {
  const [text, setText] = useState(() => toText(value));

  // Follow the parent when it changes the value itself — the actual price
  // recalculated from the offer price, a form being reset — but not when the
  // change is only this box's own keystroke coming back round. "5." and "5"
  // are the same number, and overwriting one with the other would eat the dot
  // mid-typing.
  useEffect(() => {
    const incoming = toText(value);
    setText((current) => {
      const typed = parse(current);
      const next = parse(incoming);
      if (typed === next) return current;
      // An emptied box with no onClear still holds the old value upstream;
      // leave it empty until focus leaves rather than snapping it back.
      if (current.trim() === "" && !onClear) return current;
      return incoming;
    });
  }, [value, onClear]);

  return (
    <input
      {...rest}
      type="number"
      inputMode={rest.inputMode ?? "decimal"}
      value={text}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        const n = parse(raw);
        if (n !== null) onValueChange(n);
        else if (raw.trim() === "" && onClear) onClear();
      }}
      onFocus={(e) => {
        // Selecting the contents means typing replaces a stale 0 instead of
        // appending to it ("05").
        e.target.select();
        onFocus?.(e);
      }}
      onBlur={(e) => {
        // Left empty with nowhere to report it: put the real value back so the
        // box never disagrees with what will be saved.
        if (text.trim() === "" && !onClear) setText(toText(value));
        onBlur?.(e);
      }}
      onWheel={(e) => {
        // A scroll over a focused number box silently changes it.
        e.currentTarget.blur();
        onWheel?.(e);
      }}
    />
  );
}
