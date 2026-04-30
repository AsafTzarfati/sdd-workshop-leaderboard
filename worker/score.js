// Scoring rule for the workshop.
// Replace the body of `score()` with the real rule from your ANSWER_KEY.
// Throw to reject a submission as malformed.

export function score(answer) {
  if (answer == null || typeof answer !== "object") {
    throw new Error("answer must be a JSON object");
  }
  // TODO: real scoring rule. Placeholder: 10 points per top-level key, capped at 100.
  const keys = Object.keys(answer).length;
  return Math.min(100, keys * 10);
}
