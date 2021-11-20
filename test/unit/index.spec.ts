import { cardMixins } from '@balena/jellyfish-core';
import { BalenaAPIPlugin } from '../../lib';

const context = {
	id: 'jellyfish-plugin-balena-api-test',
};

const plugin = new BalenaAPIPlugin();

test('Expected cards are loaded', () => {
	const cards = plugin.getCards(context, cardMixins);

	// Sanity check
	expect(cards['oauth-client-balena-api'].name).toEqual('Balena oauth client');
	expect(cards['oauth-provider-balena-api'].name).toEqual(
		'Balena oauth provider',
	);
});

test('Expected integrations are loaded', () => {
	const integrations = plugin.getSyncIntegrations(context);

	// Sanity check
	expect(integrations['balena-api'].slug).toEqual('balena-api');
});
