import { PluginDefinition } from '@balena/jellyfish-worker';
import { contracts } from './contracts';
import { integrations } from './integrations';

// tslint:disable-next-line: no-var-requires
const { version } = require('../package.json');

/**
 * The Balena API Jellyfish plugin.
 */
export const balenaApiPlugin = (): PluginDefinition => {
	return {
		slug: 'plugin-balena-api',
		name: 'Balena API Plugin',
		version,
		contracts,
		integrationMap: integrations,
	};
};
