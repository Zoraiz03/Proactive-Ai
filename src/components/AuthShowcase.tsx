// Dark right-hand panel from figure 2 of the scope document

const DOTS: Array<[number, number, number]> = [
  [12, 18, 3], [28, 8, 4], [44, 22, 3], [68, 12, 4], [84, 28, 3],
  [16, 46, 3], [58, 38, 3], [90, 52, 4], [24, 68, 4], [48, 60, 3],
  [72, 72, 3], [36, 84, 3], [64, 90, 4], [88, 80, 3],
];

export default function AuthShowcase({
  eyebrow,
  quote,
  accent,
}: {
  eyebrow: string;
  quote: string;
  accent: string;
}) {
  return (
    <div className="relative hidden flex-1 overflow-hidden bg-[radial-gradient(ellipse_at_70%_35%,#4a3626_0%,#2c2015_55%,#1e150d_100%)] lg:block">
      {DOTS.map(([x, y, s], i) => (
        <span
          key={i}
          className="absolute rounded-full bg-[#d8c3a5]"
          style={{
            left: `${x}%`,
            top: `${y}%`,
            width: s,
            height: s,
            opacity: 0.7,
          }}
        />
      ))}

      {/* orbit emblem */}
      <div className="absolute left-[62%] top-[38%] -translate-x-1/2 -translate-y-1/2">
        <div className="flex h-40 w-40 items-center justify-center rounded-full border border-[#5c4630]/60">
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[#f5efe3]">
            <span className="block h-8 w-8 rounded-full bg-[#6f4e2e]" />
          </div>
        </div>
      </div>

      <div className="absolute bottom-16 left-12 right-12">
        <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-[#c9a876]">
          {eyebrow}
        </p>
        <p className="mt-4 max-w-md text-3xl leading-snug text-[#f0e8da]">
          &ldquo;{quote}{" "}
          <em className="italic text-[#e0b877]">{accent}</em>&rdquo;
        </p>
      </div>
    </div>
  );
}
