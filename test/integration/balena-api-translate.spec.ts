import { defaultEnvironment } from '@balena/jellyfish-environment';
import { defaultPlugin } from '@balena/jellyfish-plugin-default';
import { productOsPlugin } from '@balena/jellyfish-plugin-product-os';
import { testUtils } from '@balena/jellyfish-worker';
import { strict as assert } from 'assert';
import * as jwt from 'jsonwebtoken';
import _ from 'lodash';
import * as jose from 'node-jose';
import path from 'path';
import * as randomstring from 'randomstring';
import { balenaApiPlugin } from '../../lib';
import webhooks from './webhooks';

const TOKEN = defaultEnvironment.integration['balena-api'];
let ctx: testUtils.TestContext;

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

	// TODO: Improve translate test suite/protocol to avoid this
	ctx.worker.setTriggers(ctx.logContext, []);

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

beforeAll(async () => {
	ctx = await testUtils.newContext({
		plugins: [productOsPlugin(), defaultPlugin(), balenaApiPlugin()],
	});

	await testUtils.translateBeforeAll(ctx);
});

afterEach(async () => {
	await testUtils.translateAfterEach(ctx);
});

afterAll(() => {
	testUtils.translateAfterAll();
	return testUtils.destroyContext(ctx);
});

describe.only('tmp', () => {
	test('skhema check', async () => {
		// Insert new account contract to match production
		const inserted = await ctx.worker.insertCard(
			ctx.logContext,
			ctx.session,
			ctx.worker.typeContracts['account@1.0.0'],
			{
				reason: null,
				attachEvents: true,
				actor: ctx.adminUserId,
			},
			{
				data: {
					plan: 'Free',
					origin: 'external-event-123295c0-ca15-40ba-95c2-0a8e12094f97@1.0.0',
					mirrors: [],
					username: 'gh_foobar23',
					annualPrice: 0,
					billingCode: 'free',
					billingCycle: 'monthly',
					canSelfsServer: true,
					monthlyPrice: 0,
					startsOnDate: '2022-02-23T22:49:05.345Z',
					translateDate: '2022-02-23T22:49:07.091Z',
					SumAnnualPrice: 0,
					SumMonthlyPrice: 0,
					discountPercentage: 0,
					isAgreedUponOnDate: '2022-02-23T22:49:05.345Z',
				},
			},
		);
		assert(inserted);
		console.log('inserted:', JSON.stringify(inserted, null, 4));

		// Attempt to perform failing patch
		const patched = await ctx.worker.patchCard(
			ctx.logContext,
			ctx.session,
			ctx.worker.typeContracts['account@1.0.0'],
			{
				reason: null,
				attachEvents: true,
				actor: ctx.adminUserId,
			},
			inserted,
			[
				{
					op: 'replace',
					path: '/data/translateDate',
					value: '2022-02-23T23:15:05.957Z',
				},
				{
					op: 'replace',
					path: '/data/origin',
					value: 'external-event-788ce7f2-9054-46a2-9f39-d07382622864@1.0.0',
				},
			],
		);

		console.log('patched:', JSON.stringify(patched, null, 4));
	});
});

describe('translate', () => {
	for (const testCaseName of Object.keys(webhooks)) {
		const testCase = webhooks[testCaseName];
		const expected = {
			head: testCase.expected.head,
			tail: _.sortBy(testCase.expected.tail, testUtils.tailSort),
		};
		for (const variation of testUtils.getVariations(testCase.steps, {
			permutations: true,
		})) {
			test(`(${variation.name}) ${testCaseName}`, async () => {
				await testUtils.webhookScenario(
					ctx,
					{
						steps: variation.combination,
						prepareEvent,
						offset:
							_.findIndex(testCase.steps, _.first(variation.combination)) + 1,
						headIndex: testCase.headIndex || 0,
						original: testCase.steps,

						// Ignore updates from user avatar trigger
						ignoreUpdateEvents: true,

						expected: _.cloneDeep(expected),
						name: testCaseName,
						variant: variation.name,
					},
					{
						source: 'balena-api',
						baseUrl: defaultEnvironment.integration['balena-api'].oauthBaseUrl,
						uriPath: /.*/,
						basePath: path.join(__dirname, 'webhooks'),
						isAuthorized: (request: any) => {
							const params = new URL(request.path).searchParams;
							return (
								params.get('api_key') === TOKEN.appSecret &&
								params.get('api_username') === TOKEN.appId
							);
						},
					},
				);
			});
		}
	}
});
