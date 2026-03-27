export async function loadRequiredModule(
  specifier: string,
  contract: string,
): Promise<Record<string, unknown>> {
  try {
    const moduleUrl = new URL(specifier, import.meta.url).href;
    return await import(moduleUrl);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "unknown import error";
    throw new Error(
      `Missing implementation for ${contract}. Expected module: ${specifier}. Original error: ${message}`,
    );
  }
}
