import * as errors from '@balena/jellyfish-sync/build/errors';
import nock from 'nock';
import * as jose from 'node-jose';
import * as jwt from 'jsonwebtoken';
import * as randomstring from 'randomstring';
import { v4 as uuidv4 } from 'uuid';

// tslint:disable-next-line: no-var-requires
const BalenaAPI = require('../../../lib/integrations/balena-api');

const context: any = {
	id: 'jellyfish-plugin-balena-api-test',
};

const TEST_BALENA_API_PRIVATE_KEY =
	'LS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0tCk1JR0hBZ0VBTUJNR0J5cUdTTTQ5QWdFR0NDcUdTTTQ5QXdFSEJHMHdhd0lCQVFRZ0lGM1M3TkNkV1MyZXJEU0YKbEcxSnBFTEZid0pNckVURUR0d3ZRMFVSUFh5aFJBTkNBQVNDR1pPcmhZTmhoY1c5YTd5OHNTNStINVFFY2tEaApGK0ZVZUV4Si9UcEtCS256RVBMNVBGNGt0L0JwZVlFNmpoQ3UvUmpjWEhXdE1DOXdRTGpQU1ZXaQotLS0tLUVORCBQUklWQVRFIEtFWS0tLS0tCg==';
const TEST_BALENA_API_PUBLIC_KEY =
	'LS0tLS1CRUdJTiBQVUJMSUMgS0VZLS0tLS0KTUZrd0V3WUhLb1pJemowQ0FRWUlLb1pJemowREFRY0RRZ0FFZ2htVHE0V0RZWVhGdld1OHZMRXVmaCtVQkhKQQo0UmZoVkhoTVNmMDZTZ1NwOHhEeStUeGVKTGZ3YVhtQk9vNFFydjBZM0Z4MXJUQXZjRUM0ejBsVm9nPT0KLS0tLS1FTkQgUFVCTElDIEtFWS0tLS0tCg==';

async function encryptPayload(payload: any): Promise<any> {
	const signedToken = jwt.sign(
		{
			data: payload,
		},
		Buffer.from(TEST_BALENA_API_PRIVATE_KEY, 'base64'),
		{
			algorithm: 'ES256',
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
			token_type: uuidv4(),
			access_token: uuidv4(),
		};
		const response = {
			id: 1234,
			username: 'foobar',
			email: 'foo@bar.baz',
		};

		nock(BalenaAPI.OAUTH_BASE_URL, {
			reqheaders: {
				Authorization: `${credentials.token_type} ${credentials.access_token}`,
			},
		})
			.get('/user/v1/whoami')
			.reply(200, response);

		const result = await BalenaAPI.whoami(context, credentials, {
			errors,
		});
		expect(result).toEqual(response);

		nock.cleanAll();
	});
});

describe('isEventValid()', () => {
	test('should return false given Balena API and invalid JSON', async () => {
		const result = await BalenaAPI.isEventValid(
			{
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
			context,
		);

		expect(result).toBe(false);
	});

	test('should return false given Balena API and invalid payload', async () => {
		const result = await BalenaAPI.isEventValid(
			{
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
			context,
		);

		expect(result).toBe(false);
	});

	test('should return true given Balena API and a key match', async () => {
		const payload = await encryptPayload({
			id: 666,
			foo: 'bar',
		});

		const result = await BalenaAPI.isEventValid(
			{
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
			context,
		);

		expect(result).toBe(true);
	});

	test('should return false given Balena API and no public key', async () => {
		const payload = await encryptPayload({
			id: 666,
			foo: 'bar',
		});

		const result = await BalenaAPI.isEventValid(
			{
				api: 'xxxxx',
				privateKey: TEST_BALENA_API_PRIVATE_KEY,
			},
			payload,
			{
				'content-type': 'application/jose',
			},
			context,
		);

		expect(result).toBe(false);
	});

	test('should return true given Balena API and no private key', async () => {
		const payload = await encryptPayload({
			id: 666,
			foo: 'bar',
		});

		const result = await BalenaAPI.isEventValid(
			{
				api: 'xxxxx',
				production: {
					publicKey: TEST_BALENA_API_PUBLIC_KEY,
				},
			},
			payload,
			{
				'content-type': 'application/jose',
			},
			context,
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

		const result = await BalenaAPI.mergeCardWithPayload(
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
		const result = await BalenaAPI.mergeCardWithPayload(
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
		const result = await BalenaAPI.mergeCardWithPayload(
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
		const result = await BalenaAPI.mergeCardWithPayload(
			undefined,
			payload,
			'organization',
			'account@1.0.0',
		);
		expect(result).toEqual(expected);
	});
});
