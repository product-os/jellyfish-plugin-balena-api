import { JellyfishPluginBase } from '@balena/jellyfish-plugin-base';
import { cards } from './cards';
import integrations from './integrations';

/**
 * The Balena API Jellyfish plugin.
 */
export class BalenaAPIPlugin extends JellyfishPluginBase {
	constructor() {
		super({
			slug: 'jellyfish-plugin-balena-api',
			name: 'Balena API Plugin',
			version: '1.0.0',
			cards,
			integrations,
			requires: [
				{
					slug: 'action-library',
					version: '>=15.x',
				},
				{
					slug: 'jellyfish-plugin-default',
					version: '>=19.x',
				},
			],
		});
	}
}
