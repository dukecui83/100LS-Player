export function emptyCueRepeat() {
  return { cueIndex: -1, count: 0 };
}

export function recordCuePlayback(previous, cueIndex) {
  if (!Number.isInteger(cueIndex) || cueIndex < 0) return emptyCueRepeat();
  return {
    cueIndex,
    count: previous.cueIndex === cueIndex ? previous.count + 1 : 1,
  };
}
