import axios from 'axios';

export async function getDeploymentLogs(deploymentId) {
  if (!process.env.VERCEL_API_TOKEN) throw new Error('VERCEL_API_TOKEN is not configured; deployment logs are unavailable.');
  try {
    const response = await axios.get(`https://api.vercel.com/v2/deployments/${encodeURIComponent(deploymentId)}/events`, { headers: { Authorization: `Bearer ${process.env.VERCEL_API_TOKEN}` }, timeout: 15_000 });
    const errorLogs = response.data.filter(event => event.type === 'error' || event.message?.toLowerCase().includes('error')).map(event => event.message).filter(Boolean).join('\n');
    return errorLogs || response.data.slice(-10).map(event => event.message).filter(Boolean).join('\n');
  } catch (error) {
    throw new Error(`Could not retrieve Vercel deployment logs (${error.response?.status || 'network error'}).`);
  }
}

export default { getDeploymentLogs };
