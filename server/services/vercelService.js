const axios = require('axios');

/**
 * Fetches recent deployment logs for a given Vercel deployment ID.
 * @param {string} deploymentId 
 * @returns {Promise<string>} Concentrated log text for analysis
 */
async function getDeploymentLogs(deploymentId) {
    if (!process.env.VERCEL_API_TOKEN) {
        console.warn("VERCEL_API_TOKEN not set. Using simulated logs.");
        return "Simulated Vercel Build Error: Cannot invoke an object which is possibly 'undefined'.";
    }

    try {
        const response = await axios.get(
            `https://api.vercel.com/v2/deployments/${deploymentId}/events`,
            {
                headers: {
                    Authorization: `Bearer ${process.env.VERCEL_API_TOKEN}`
                }
            }
        );

        // Extract plain text logs specifically looking for errors
        let errorLogs = response.data
            .filter(event => event.type === 'error' || event.message?.toLowerCase().includes('error'))
            .map(event => event.message)
            .join("\n");

        if (!errorLogs) {
            // Fallback to last few lines of general log
            errorLogs = response.data.slice(-10).map(e => e.message).join("\n");
        }

        return errorLogs;
    } catch (error) {
        console.error("Error fetching Vercel logs:", error.message);
        return "Vercel Log Retrieval Failed: " + error.message;
    }
}

module.exports = { getDeploymentLogs };
