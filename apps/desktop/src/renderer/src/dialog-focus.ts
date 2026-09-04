export function wrappedFocusIndex(
  currentIndex: number,
  itemCount: number,
  backwards: boolean,
): number {
  if (itemCount <= 0) return -1;
  if (currentIndex < 0) return backwards ? itemCount - 1 : 0;
  if (backwards) return currentIndex === 0 ? itemCount - 1 : currentIndex - 1;
  return currentIndex === itemCount - 1 ? 0 : currentIndex + 1;
}
