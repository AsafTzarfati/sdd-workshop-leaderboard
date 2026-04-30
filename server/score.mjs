// Scoring rule for the workshop.
//
// Replace the body of `score()` with the real rule from your ANSWER_KEY.md.
// Input: the parsed `answer.json` the user uploaded.
// Output: an integer 0..100 (or whatever your scale is).
//
// Throw to reject a submission as malformed.

export function score(answer) {
  // TODO: implement real scoring logic.
  // Placeholder: count how many top-level keys the submission has, capped at 100.
  if (answer == null || typeof answer !== "object") {
    throw new Error("answer must be a JSON object");
  }
  const keys = Object.keys(answer).length;
  return Math.min(100, keys * 10);
}
