export function getConfiguredAiEndpoint(): string | undefined {
  const endpoint = process.env.EXPO_PUBLIC_SENSORAFT_AI_ENDPOINT;
  return typeof endpoint === 'string' && endpoint.trim().length > 0 ? endpoint.trim() : undefined;
}
