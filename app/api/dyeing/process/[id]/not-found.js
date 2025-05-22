// This file helps Next.js handle cases where the dynamic API resource isn't found
export default function NotFound() {
  return {
    status: 404,
    body: { error: 'Dyeing process not found' }
  };
} 