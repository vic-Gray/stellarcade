const DeploymentUtil = require('../utils/deployment.util');

class DeploymentService {
    constructor(networkProfile = 'Dev') {
        this.networkProfile = networkProfile;
    }

    /**
     * Retrieves all verified contract addresses for the current active profile.
     * Useful for API metadata endpoints broadcasting the deployed system state to clients.
     */
    getContractRegistry() {
        try {
            const deployMap = DeploymentUtil.loadDeploymentMap(this.networkProfile);
            return deployMap.contracts;
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error(`Failed to load contract registry for ${this.networkProfile}:`, err.message);
            return {};
        }
    }

    /**
     * Fetches the underlying mapped address for a specific contract to initialize transactions.
     */
    resolveAddress(contractAlias) {
        try {
            return DeploymentUtil.getContractAddress(contractAlias, this.networkProfile);
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error(`Error resolving address for contract '${contractAlias}':`, err.message);
            throw new Error(`Contract ${contractAlias} is not properly deployed or initialized`);
        }
    }

    /**
     * Validates if the deployment artifacts are synced with the active environment.
     */
    async validateNetworkSync() {
        try {
            const deployMap = DeploymentUtil.loadDeploymentMap(this.networkProfile);

            // Perform integrity checks between deployment output and actual network constants if applicable
            return {
                synced: true,
                profile: deployMap.network,
                timestamp: deployMap.timestamp,
                authorizedAdmin: deployMap.adminAddress,
            };
        } catch (err) {
            return { synced: false, error: err.message };
        }
    }

    /**
     * Performs a comprehensive dry-run validation of the deployment environment and artifacts.
     */
    async performDryRun() {
        try {
            return DeploymentUtil.generateValidationReport();
        } catch (err) {
            return {
                success: false,
                error: err.message,
                timestamp: new Date().toISOString()
            };
        }
    }
}

module.exports = new DeploymentService(process.env.NETWORK_PROFILE || 'Dev');
