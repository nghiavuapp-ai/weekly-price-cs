type Sleep = (milliseconds: number) => Promise<void>

const sleep: Sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

export async function withFutureJwtRetry<T>(
  operation: () => Promise<T>,
  wait: Sleep = sleep,
): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.toLowerCase().includes('jwt issued at future')) throw error
    await wait(1500)
    return operation()
  }
}
