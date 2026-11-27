declare module 'whack-game-sdk' {
  interface RoundContext {
    container: HTMLElement
    signal: AbortSignal
    finish(data: { scores: { type: string; score: number }[] }): boolean
  }

  interface AppBridge {
    readonly available: boolean
    call(method: string, params: unknown): Promise<unknown>
    destroy(): void
  }

  export function createAppBridge(): AppBridge

  export function createGameSdkFromConfig(options: {
    root: HTMLElement
    appBridge: AppBridge
    game: {
      start(context: RoundContext): Promise<void>
      stop(): void
    }
    onError(error: unknown, operation: string): void
  }): Promise<{ start(): void; destroy(): void }>
}
