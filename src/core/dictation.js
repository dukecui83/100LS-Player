const ENGLISH_WORD_PATTERN = /[A-Za-z0-9]+(?:['’][A-Za-z0-9]+)*/g;

export function extractDictationWords(text) {
  return String(text || '').match(ENGLISH_WORD_PATTERN) || [];
}

export function normalizeDictationWord(value) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase()
    .replace(/’/g, "'")
    .replace(/^[^a-z0-9]+|[^a-z0-9']+$/g, '');
}

export function evaluateDictation(expectedWords, enteredWords) {
  const results = expectedWords.map((expected, index) => {
    const entered = enteredWords[index] || '';
    return {
      expected,
      entered,
      correct: normalizeDictationWord(expected) === normalizeDictationWord(entered),
    };
  });
  return {
    results,
    correctCount: results.filter((result) => result.correct).length,
    totalCount: results.length,
  };
}
