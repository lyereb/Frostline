export const MATCH_DURATION_MS = 60_000

export class DistanceMatch {
  readonly deadline = performance.now() + MATCH_DURATION_MS
  private travelled = 0

  get secondsLeft(): number {
    return Math.max(0, this.deadline - performance.now()) / 1000
  }

  get distanceMeters(): number {
    return Math.floor(this.travelled)
  }

  recordStep(fromZ: number, toZ: number): void {
    this.travelled += Math.max(0, toZ - fromZ)
  }
}
