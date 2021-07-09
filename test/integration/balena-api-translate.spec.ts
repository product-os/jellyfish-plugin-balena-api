/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */
// tslint:disable: no-var-requires

import ActionLibrary from '@balena/jellyfish-action-library';
import { defaultEnvironment } from '@balena/jellyfish-environment';
import { syncIntegrationScenario } from '@balena/jellyfish-test-harness';
import * as jwt from 'jsonwebtoken';
import * as jose from 'node-jose';
import * as querystring from 'querystring';
import * as randomstring from 'randomstring';
import { BalenaAPIPlugin } from '../../lib';
import webhooks from './webhooks/balena-api';

const url = require('native-url');
const DefaultPlugin = require('@balena/jellyfish-plugin-default');

const TOKEN = defaultEnvironment.integration['balena-api'];

async function prepareEvent(event: any): Promise<any> {
	const signedToken = jwt.sign(
		{
			data: event.payload,
		},
		Buffer.from(TOKEN.privateKey, 'base64'),
		{
			algorithm: 'ES256',
			expiresIn: 10 * 60 * 1000,
			audience: 'jellyfish',
			issuer: 'api.balena-cloud.com',
			jwtid: randomstring.generate(20),
			subject: `${event.payload.id}`,
		},
	);

	const keyValue = Buffer.from(TOKEN.production.publicKey, 'base64');
	const encryptionKey = await jose.JWK.asKey(keyValue, 'pem');

	const cipher = jose.JWE.createEncrypt(
		{
			format: 'compact',
		},
		encryptionKey,
	);
	cipher.update(signedToken);

	const result = await cipher.final();
	event.source = 'balena-api';
	event.payload = result;
	event.headers['content-type'] = 'application/jose';
	return event;
}

syncIntegrationScenario.run(
	{
		test,
		before: beforeAll,
		beforeEach,
		after: afterAll,
		afterEach,
	},
	{
		basePath: __dirname,
		plugins: [ActionLibrary, DefaultPlugin, BalenaAPIPlugin],
		cards: [],
		scenarios: webhooks,
		baseUrl: defaultEnvironment.integration['balena-api'].oauthBaseUrl,
		stubRegex: /.*/,
		source: 'balena-api',
		prepareEvent,
		options: {
			token: TOKEN,
		},
		isAuthorized: (self: any, request: any) => {
			const params = querystring.parse(url.parse(request.path).query);
			return (
				params.api_key === self.options.token.api &&
				params.api_username === self.options.token.username
			);
		},
	},
);
