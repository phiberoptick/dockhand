// Disable SSR for the entire app - it's a Docker management dashboard
// that relies entirely on client-side data fetching from the Docker API
export const ssr = false;
