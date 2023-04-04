import nock from 'nock';
import * as jose from 'node-jose';
import * as jwt from 'jsonwebtoken';
import * as crypto from 'node:crypto';
import * as randomstring from 'randomstring';
import { PluginManager } from '@balena/jellyfish-worker';
import { balenaApiPlugin } from '../../../lib';

const pluginManager = new PluginManager([balenaApiPlugin()]);
const balenaApiIntegration = pluginManager.getSyncIntegrations()['balena-api'];

const logContext: any = {
	id: 'jellyfish-plugin-balena-api-test',
};

// @ts-expect-error
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
	modulusLength: 2048,
	privateKeyEncoding: {
		type: 'pkcs8',
		format: 'pem',
	},
	publicKeyEncoding: {
		type: 'spki',
		format: 'pem',
	},
	algorithm: 'RSA-SHA256',
});

const TEST_BALENA_API_PRIVATE_KEY = Buffer.from(privateKey).toString('base64');
const TEST_BALENA_API_PUBLIC_KEY = Buffer.from(publicKey).toString('base64');

async function encryptPayload(payload: any): Promise<any> {
	const signedToken = jwt.sign(
		{
			data: payload,
		},
		Buffer.from(TEST_BALENA_API_PRIVATE_KEY, 'base64'),
		{
			algorithm: 'RS256',
			expiresIn: 10 * 60 * 1000,
			audience: 'jellyfish',
			issuer: 'api.balena-cloud.com',
			jwtid: randomstring.generate(20),
			subject: `${payload.id}`,
		},
	);

	const keyValue = Buffer.from(TEST_BALENA_API_PUBLIC_KEY, 'base64');
	const encryptionKey = await jose.JWK.asKey(keyValue, 'pem');

	const cipher = jose.JWE.createEncrypt(
		{
			format: 'compact',
		},
		encryptionKey,
	);
	cipher.update(signedToken);

	const result = await cipher.final();
	return result;
}

describe('whoami()', () => {
	test('should get and return user information', async () => {
		const credentials = {
			token_type: crypto.randomUUID(),
			access_token: crypto.randomUUID(),
		};
		const response = {
			id: 1234,
			username: 'foobar',
			email: 'foo@bar.baz',
		};

		nock('https://api.balena-cloud.com', {
			reqheaders: {
				Authorization: `${credentials.token_type} ${credentials.access_token}`,
			},
		})
			.get('/user/v1/whoami')
			.reply(200, response);

		const result = await balenaApiIntegration.whoami!(logContext, credentials);
		expect(result).toEqual(response);

		nock.cleanAll();
	});
});

describe('isEventValid()', () => {
	test('should return false given Balena API and invalid JSON', async () => {
		const result = await balenaApiIntegration.isEventValid(
			logContext,
			{
				id: crypto.randomUUID(),
				api: 'xxxxx',
				production: {
					publicKey: TEST_BALENA_API_PUBLIC_KEY,
				},
				privateKey: TEST_BALENA_API_PRIVATE_KEY,
			},
			'{"foo":"bar"}',
			{
				'content-type': 'application/jose',
			},
		);

		expect(result).toBe(false);
	});

	test('should return false given Balena API and invalid payload', async () => {
		const result = await balenaApiIntegration.isEventValid(
			logContext,
			{
				id: crypto.randomUUID(),
				api: 'xxxxx',
				production: {
					publicKey: TEST_BALENA_API_PUBLIC_KEY,
				},
				privateKey: TEST_BALENA_API_PRIVATE_KEY,
			},
			'xxxxxxxxxxxxxx',
			{
				'content-type': 'application/jose',
			},
		);

		expect(result).toBe(false);
	});

	test('should return true given Balena API and a key match', async () => {
		const payload = await encryptPayload({
			id: 666,
			foo: 'bar',
		});

		const result = await balenaApiIntegration.isEventValid(
			logContext,
			{
				id: crypto.randomUUID(),
				api: 'xxxxx',
				production: {
					publicKey: TEST_BALENA_API_PUBLIC_KEY,
				},
				privateKey: TEST_BALENA_API_PRIVATE_KEY,
			},
			payload,
			{
				'content-type': 'application/jose',
			},
		);

		expect(result).toBe(true);
	});

	test('should return false given Balena API and no public key', async () => {
		const payload = await encryptPayload({
			id: 666,
			foo: 'bar',
		});

		const result = await balenaApiIntegration.isEventValid(
			logContext,
			{
				id: crypto.randomUUID(),
				api: 'xxxxx',
				privateKey: TEST_BALENA_API_PRIVATE_KEY,
			},
			payload,
			{
				'content-type': 'application/jose',
			},
		);

		expect(result).toBe(false);
	});

	test('should return true given Balena API and no private key', async () => {
		const payload = await encryptPayload({
			id: 666,
			foo: 'bar',
		});

		const result = await balenaApiIntegration.isEventValid(
			logContext,
			{
				id: crypto.randomUUID(),
				api: 'xxxxx',
				production: {
					publicKey: TEST_BALENA_API_PUBLIC_KEY,
				},
			},
			payload,
			{
				'content-type': 'application/jose',
			},
		);

		expect(result).toBe(false);
	});
});

describe('mergeCardWithPayload()', () => {
	test('should translate user resource', async () => {
		const payload = {
			resource: 'user',
			type: 'update',
			timestamp: '2020-10-22T13:52:37.535Z',
			source: '127.0.0.1',
			payload: {
				has_legacy_link_to__organization: [
					{
						company_name: 'Legacy Balena',
					},
				],
				id: 15,
				username: 'newusername',
				first_name: null,
				last_name: null,
				email: 'newemail@example.org',
				account_type: null,
				ip: '::ffff:127.0.0.1',
			},
		};

		const expected = {
			active: true,
			data: {
				mirrors: ['https://127.0.0.1/v5/user(15)'],
				profile: {
					company: 'Legacy Balena',
				},
				translateDate: '2020-10-22T13:52:37.535Z',
				roles: ['user-external-support'],
				hash: 'PASSWORDLESS',
				email: 'newemail@example.org',
			},
			type: 'user@1.0.0',
			slug: 'user-newusername',
			name: 'newusername',
		};

		const result = await balenaApiIntegration.mergeCardWithPayload!(
			undefined,
			payload,
			'user',
			'user@1.0.0',
		);
		expect(result).toEqual(expected);
	});

	test('should translate organization resource', async () => {
		const payload = {
			resource: 'organization',
			type: 'update',
			timestamp: '2020-10-20T13:05:40.923Z',
			source: '127.0.0.1',
			payload: {
				id: 19,
				name: 'newusername',
				company_name: 'Balena',
				internal_company_name: 'fake balena',
				internal_note:
					'long note about the history of fake balena and real balena',
				industry: 'IoT',
				website: 'https://www.balena.co.uk.jp',
				handle: 'newusername',
			},
		};

		const expected = {
			active: true,
			data: {
				mirrors: ['https://127.0.0.1/v5/organization(19)'],
				translateDate: '2020-10-20T13:05:40.923Z',
				internal_company_name: 'fake balena',
				internal_note:
					'long note about the history of fake balena and real balena',
				industry: 'IoT',
				website: 'https://www.balena.co.uk.jp',
				username: 'newusername',
			},
			type: 'account@1.0.0',
			slug: 'account-balena',
			name: 'Balena',
		};

		// eslint-disable-next-line no-undefined, no-undef
		const result = await balenaApiIntegration.mergeCardWithPayload!(
			undefined,
			payload,
			'organization',
			'account@1.0.0',
		);
		expect(result).toEqual(expected);
	});

	test('should translate organization with nested subscription resource', async () => {
		const payload = {
			resource: 'organization',
			type: 'update',
			timestamp: '2020-10-20T13:05:40.923Z',
			source: '127.0.0.1',
			payload: {
				subscription: [
					{
						id: 25,
						billing_cycle: 'monthly',
						starts_on__date: '2020-10-20T13:05:39.976Z',
						ends_on__date: '2020-12-20T13:05:39.976Z',
						discount_percentage: 0,
						bills_base_with__recurly_id: 'abcde12345',
						bills_addons_with__recurly_id: '54321edcba',
						is_agreed_upon_on__date: '2020-10-20T13:05:39.976Z',
						internal_note: 'Note about why this subscription',
					},
				],
				id: 19,
				name: 'newusername',
				company_name: 'Balena',
				internal_company_name: 'fake balena',
				internal_note:
					'long note about the history of fake balena and real balena',
				industry: 'IoT',
				website: 'https://www.balena.co.uk.jp',
				handle: 'newusername',
			},
		};

		const expected = {
			active: true,
			data: {
				mirrors: [
					'https://127.0.0.1/v5/organization(19)',
					'https://127.0.0.1/v5/subscription(25)',
				],
				translateDate: '2020-10-20T13:05:40.923Z',
				internal_company_name: 'fake balena',
				internal_note:
					'long note about the history of fake balena and real balena',
				industry: 'IoT',
				website: 'https://www.balena.co.uk.jp',
				username: 'newusername',
				discountPercentage: 0,
				startsOnDate: '2020-10-20T13:05:39.976Z',
				endsOnDate: '2020-12-20T13:05:39.976Z',
				subscriptionNote: 'Note about why this subscription',
				billingCycle: 'monthly',
				isAgreedUponOnDate: '2020-10-20T13:05:39.976Z',
			},
			type: 'account@1.0.0',
			slug: 'account-balena',
		};

		// eslint-disable-next-line no-undefined, no-undef
		const result = await balenaApiIntegration.mergeCardWithPayload!(
			undefined,
			payload,
			'organization',
			'account@1.0.0',
		);
		expect(result).toEqual(expected);
	});

	test('should translate organization with nested subscription and plan resource', async () => {
		const payload = {
			resource: 'organization',
			type: 'update',
			timestamp: '2020-10-20T13:05:40.923Z',
			source: '127.0.0.1',
			payload: {
				subscription: [
					{
						is_for__plan: [
							{
								id: 1,
								title: 'Free',
								billing_code: 'free',
								generation: 2,
								monthly_price: 0,
								annual_price: 0,
								can_self_serve: true,
								is_legacy: false,
							},
						],
						id: 25,
						billing_cycle: 'monthly',
						starts_on__date: '2020-10-20T13:05:39.976Z',
						ends_on__date: '2020-12-20T13:05:39.976Z',
						discount_percentage: 0,
						bills_base_with__recurly_id: 'abcde12345',
						bills_addons_with__recurly_id: '54321edcba',
						is_agreed_upon_on__date: '2020-10-20T13:05:39.976Z',
						internal_note: 'Note about why this subscription',
					},
				],
				id: 19,
				name: 'newusername',
				company_name: 'Balena',
				internal_company_name: 'fake balena',
				internal_note:
					'long note about the history of fake balena and real balena',
				industry: 'IoT',
				website: 'https://www.balena.co.uk.jp',
				handle: 'newusername',
			},
		};

		const expected = {
			active: true,
			data: {
				annualPrice: 0,
				billingCode: 'free',
				billingCycle: 'monthly',
				canSelfServe: true,
				discountPercentage: 0,
				endsOnDate: '2020-12-20T13:05:39.976Z',
				generation: 2,
				industry: 'IoT',
				internal_company_name: 'fake balena',
				internal_note:
					'long note about the history of fake balena and real balena',
				isAgreedUponOnDate: '2020-10-20T13:05:39.976Z',
				mirrors: [
					'https://127.0.0.1/v5/organization(19)',
					'https://127.0.0.1/v5/subscription(25)',
					'https://127.0.0.1/v5/plan(1)',
				],
				monthlyPrice: 0,
				plan: 'Free',
				startsOnDate: '2020-10-20T13:05:39.976Z',
				subscriptionNote: 'Note about why this subscription',
				translateDate: '2020-10-20T13:05:40.923Z',
				username: 'newusername',
				website: 'https://www.balena.co.uk.jp',
			},
			slug: 'account-balena',
			type: 'account@1.0.0',
		};

		// eslint-disable-next-line no-undefined, no-undef
		const result = await balenaApiIntegration.mergeCardWithPayload!(
			undefined,
			payload,
			'organization',
			'account@1.0.0',
		);
		expect(result).toEqual(expected);
	});
});
