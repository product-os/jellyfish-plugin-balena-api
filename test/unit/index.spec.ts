import { defaultPlugin } from '@balena/jellyfish-plugin-default';
import { PluginManager } from '@balena/jellyfish-worker';
import { balenaApiPlugin } from '../../lib';

const pluginManager = new PluginManager([defaultPlugin(), balenaApiPlugin()]);

test('Expected cards are loaded', () => {
	const cards = pluginManager.getCards();

	// Sanity check
	expect(cards['oauth-provider-balena-api'].name).toEqual(
		'Balena oauth provider',
	);
});

test('Expected integrations are loaded', () => {
	const integrations = pluginManager.getSyncIntegrations();

	// Sanity check
	expect(Object.keys(integrations).includes('balena-api')).toBeTruthy();
});
