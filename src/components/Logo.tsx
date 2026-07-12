import Link from "next/link";

export default function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-bronze-deep text-cream">
        <span className="block h-2.5 w-2.5 rounded-full border-[3px] border-cream" />
      </span>
      <span className="text-[15px] font-bold tracking-tight">
        Proactive·AI
      </span>
    </Link>
  );
}
