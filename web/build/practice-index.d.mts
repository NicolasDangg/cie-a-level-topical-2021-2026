export declare const PRACTICE_SCHEMA: string
export declare const PRACTICE_SUBJECTS: string[]
export declare function practiceIndex(
  repoRoot: string,
  subject: string,
): { schema: string; subject: string; topics: Record<string, { id: string; marks: number }[]> }
