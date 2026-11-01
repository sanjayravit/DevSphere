// API gateways and providers may return { error: { code, message } }, not
// necessarily a string. Never put arbitrary response objects into React state.
export function errorMessage(error, fallback = 'Something went wrong. Please try again.') {
  const candidates = [
    error?.response?.data?.error,
    error?.response?.data?.error?.message,
    error?.response?.data?.message,
    error?.message,
    error
  ];
  const message = candidates.find(value => typeof value === 'string' && value.trim());
  return message ? message.trim().slice(0, 1000) : fallback;
}
