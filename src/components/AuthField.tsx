"use client";

interface Props {
  label: string;
  icon: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  trailing?: React.ReactNode;
  autoComplete?: string;
}

export default function AuthField({
  label,
  icon,
  type,
  value,
  onChange,
  placeholder,
  trailing,
  autoComplete,
}: Props) {
  return (
    <label className="block">
      <span className="flex items-center justify-between text-xs font-medium text-ink-soft">
        <span>
          <span className="mr-1">{icon}</span>
          {label}
        </span>
        {trailing}
      </span>
      <input
        type={type}
        required
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full rounded-lg border border-sand bg-[#fffdf5] px-3.5 py-2.5 text-sm outline-none transition focus:border-bronze"
      />
    </label>
  );
}
