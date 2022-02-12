import * as assert from '@balena/jellyfish-assert';
import { defaultEnvironment } from '@balena/jellyfish-environment';
import { getLogger, LogContext } from '@balena/jellyfish-logger';
import { Integration, IntegrationDefinition } from '@balena/jellyfish-worker';
import * as syncErrors from '@balena/jellyfish-worker/build/sync/errors';
import { SyncActionContext } from '@balena/jellyfish-worker/build/sync/sync-context';
import axios from 'axios';
import * as geoip from 'geoip-lite';
import * as jwt from 'jsonwebtoken';
import _ from 'lodash';
import * as jose from 'node-jose';
import * as randomstring from 'randomstring';
import { v4 as uuidv4 } from 'uuid';
import * as utils from './utils';

const SLUG = 'balena-api';
const RATE_LIMIT_CODE = 429;

const logger = getLogger(__filename);
const integration = defaultEnvironment.integration['balena-api'];

function getMirrorId(
	host: string,
	id: string,
	type: string,
	version = 'v5',
): string {
	return `https://${host}/${version}/${type}(${id})`;
}

function getCardSlug(type: string, name: string): string {
	return `${type.split('@')[0]}-${utils.slugify(name || uuidv4())}`;
}

function userCreateContainsUsername(payload: any): boolean {
	// Ignore update events with no info at all
	// apart from the user id, as we can't do
	// much in this case anyways.

	// Return if not user resource
	if (payload.resource !== 'user') {
		return false;
	}

	// Return if not username
	if (!payload.payload.username) {
		return false;
	}

	return true;
}

async function getPreExistingCard(
	context: any,
	payload: any,
	resourceType: string,
	cardType: string,
): Promise<any> {
	// Get the pre-existing card by mirror id
	let mirrorId = getMirrorId(payload.source, payload.payload.id, resourceType);
	let preExistingCard = await context.getElementByMirrorId(cardType, mirrorId);

	// TODO: figure out a clean API for merging plans, subscriptions into organization card type.
	// If preExistingCard doesn't exist and we are looking for
	// either a subscription or plan
	// get the organization card.
	if (
		(resourceType === 'subscription' || resourceType === 'plan') &&
		!preExistingCard
	) {
		mirrorId = getMirrorId(payload.source, payload.payload.id, 'organization');
		preExistingCard = await context.getElementByMirrorId(
			'account@1.0.0',
			mirrorId,
		);
	}

	return preExistingCard;
}

function makeCard(card: any, actor: any, time: any): any {
	let date = new Date();
	if (time) {
		date = new Date(time);
	}

	return {
		time: date,
		card,
		actor,
	};
}

function mergeUserKeys(
	preExistingCard: any,
	card: any,
	payload: any,
	cardType: string,
): any {
	const slug = getCardSlug(cardType, payload.payload.username);
	updateProperty(card, ['slug'], slug);

	updateProperty(card, ['name'], payload.payload.username.trim());

	// Setup user roles to external support role if no pre-existingCard exists
	if (!preExistingCard) {
		updateProperty(card, ['data', 'roles'], ['user-external-support']);
		updateProperty(card, ['data', 'hash'], 'PASSWORDLESS');
	}

	updateProperty(card, ['data', 'email'], payload.payload.email);

	const companyArray = _.get(payload, [
		'payload',
		'has_legacy_link_to__organization',
	]);

	updateProperty(
		card,
		['data', 'profile', 'company'],
		_.get(_.first(companyArray), ['company_name']) || payload.payload.company,
	);

	updateProperty(
		card,
		['data', 'profile', 'type'],
		payload.payload.account_type,
	);

	updateProperty(
		card,
		['data', 'profile', 'name', 'first'],
		payload.payload.first_name,
	);

	updateProperty(
		card,
		['data', 'profile', 'name', 'last'],
		payload.payload.last_name,
	);

	if (payload.payload.ip) {
		const location = geoip.lookup(payload.payload.ip);
		if (location) {
			updateProperty(card, ['data', 'profile', 'city'], location.city);
			updateProperty(card, ['data', 'profile', 'country'], location.country);
		}
	}

	return card;
}

function mergeOrgKeys(
	_preExistingCard: any,
	card: any,
	orgPayload: any,
	cardType: string,
): any {
	const name = orgPayload.company || orgPayload.company_name || orgPayload.name;
	const slug = getCardSlug(cardType, name);

	if (!_.has(card, ['slug'])) {
		updateProperty(card, ['slug'], slug);
	}

	updateProperty(card, ['name'], name);

	updateProperty(
		card,
		['data', 'internal_company_name'],
		orgPayload.internal_company_name,
	);

	updateProperty(card, ['data', 'internal_note'], orgPayload.internal_note);

	updateProperty(card, ['data', 'industry'], orgPayload.industry);

	updateProperty(card, ['data', 'website'], orgPayload.website);

	updateProperty(card, ['data', 'username'], orgPayload.handle);

	return card;
}

function mergeSubscriptionKeys(
	_preExistingCard: any,
	card: any,
	subscriptionPayload: any,
	cardType: string,
): any {
	if (_.has(subscriptionPayload, ['payload', 'is_for__organization'])) {
		const org = _.get(subscriptionPayload, [
			'payload',
			'is_for__organization',
		])[0];

		if (!_.has(card, ['slug']) && _.has(org, ['company_name'])) {
			const name = _.get(org[0], ['company_name']);
			const slug = getCardSlug(cardType, name);

			updateProperty(card, ['slug'], slug);
		}
	}

	updateProperty(card, ['name'], subscriptionPayload.company);

	updateProperty(
		card,
		['data', 'discountPercentage'],
		subscriptionPayload.discount_percentage,
	);

	updateProperty(
		card,
		['data', 'startsOnDate'],
		subscriptionPayload.starts_on__date,
	);

	updateProperty(
		card,
		['data', 'endsOnDate'],
		subscriptionPayload.ends_on__date,
	);

	updateProperty(
		card,
		['data', 'subscriptionNote'],
		subscriptionPayload.internal_note,
	);

	updateProperty(
		card,
		['data', 'billingCycle'],
		subscriptionPayload.billing_cycle,
	);

	updateProperty(
		card,
		['data', 'isAgreedUponOnDate'],
		subscriptionPayload.is_agreed_upon_on__date,
	);

	return card;
}

function mergePlanKeys(
	_preExistingCard: any,
	card: any,
	planPayload: any,
	_cardType: string,
): any {
	updateProperty(card, ['data', 'billingCode'], planPayload.billing_code);

	updateProperty(card, ['data', 'canSelfServe'], planPayload.can_self_serve);

	updateProperty(card, ['data', 'monthlyPrice'], planPayload.monthly_price);

	updateProperty(card, ['data', 'annualPrice'], planPayload.annual_price);

	updateProperty(card, ['data', 'generation'], planPayload.generation);

	updateProperty(card, ['data', 'plan'], planPayload.title);

	updateProperty(card, ['data', 'isLegacy'], planPayload.is_legacy);

	return card;
}

function setMirrorId(
	card: any,
	payload: any,
	id: string,
	resourceType: string,
): any {
	// Add the mirrorId to the list of card mirrors
	const mirrorId = getMirrorId(payload.source, id, resourceType);
	const mirrors = _.get(card, ['data', 'mirrors'], []).concat(mirrorId);
	_.set(card, ['data', 'mirrors'], _.uniq(mirrors));

	return card;
}

function mergeCardWithPayload(
	preExistingCard: any,
	payload: any,
	resourceType: string,
	cardType: string,
): any {
	// If there is no preExistingCard default to empty object
	let card = Object.assign({}, preExistingCard) || {
		tags: [],
		links: {},
		markers: [],
	};

	// Configure options for updateProperty()
	const cardDate = new Date(_.get(card, ['data', 'translateDate']));
	const payloadDate = new Date(payload.timestamp);

	// Only update fields if the payload was emitted more recently then the last translate date
	if (preExistingCard && payloadDate.getTime() < cardDate.getTime()) {
		return preExistingCard;
	}

	// Setup base card fields

	// Set active to true, unless handling a delete event
	// Note we never re-activate a card when deactivated
	if (card.active !== false) {
		_.set(card, ['active'], payload.type !== 'delete');
	}

	// Add the mirrorId to the list of card mirrors
	card = setMirrorId(card, payload, payload.payload.id, resourceType);

	// Set card type
	_.set(card, ['type'], cardType);

	// Set or update timestamp
	// TODO ensure that updates that ONLY change the translate date are ignored, as nothing has been translated
	const timestamp = new Date(payload.timestamp).toISOString();
	updateProperty(card, ['data', 'translateDate'], timestamp);

	// Making User card
	// Set user keys
	if (resourceType === 'user') {
		card = mergeUserKeys(preExistingCard, card, payload, cardType);
	}

	// Making Account card
	// Set organisation keys
	// Set subscription keys
	// Set plan keys
	if (resourceType === 'organization') {
		const orgPayload = payload.payload;
		card = mergeOrgKeys(preExistingCard, card, orgPayload, cardType);
	}

	if (resourceType === 'subscription') {
		const subscriptionPayload = payload.payload;
		card = mergeSubscriptionKeys(
			preExistingCard,
			card,
			subscriptionPayload,
			cardType,
		);
	}

	if (_.has(payload, ['payload', 'subscription'])) {
		const subscriptionPayload = _.get(payload, ['payload', 'subscription'])[0];
		card = setMirrorId(card, payload, subscriptionPayload.id, 'subscription');
		card = mergeSubscriptionKeys(
			preExistingCard,
			card,
			subscriptionPayload,
			cardType,
		);

		if (_.has(subscriptionPayload, ['is_for__plan'])) {
			const planPayload = _.get(subscriptionPayload, ['is_for__plan'])[0];
			card = setMirrorId(card, payload, planPayload.id, 'plan');
			card = mergePlanKeys(preExistingCard, card, planPayload, cardType);
		}
	}

	if (resourceType === 'plan') {
		const planPayload = _.get(payload, ['payload', 'is_for__plan'])[0];
		card = mergePlanKeys(preExistingCard, card, planPayload, cardType);
	}

	if (_.has(payload, ['payload', 'is_for__plan'])) {
		const planPayload = _.get(payload, ['payload', 'is_for__plan'])[0];
		card = setMirrorId(card, payload, planPayload.id, 'plan');
		card = mergePlanKeys(preExistingCard, card, planPayload, cardType);
	}

	return card;
}

// TODO: Use JSON patch here
function updateProperty(object: any, path: any, value: any): void {
	// If the value is undefined, and the payload is more recent than the card

	if (_.isUndefined(value)) {
		// Remove the payload
		_.unset(object, path);

		// Including _.isNumber(value) on this check allows for setting
		// the number 0 as a value
	} else if (value || _.isNumber(value)) {
		// If we do have a value, set it.
		_.set(object, path, value);
	}
}

function getCardAndResourceType(payloadResource: any): any {
	if (payloadResource === 'user') {
		// All users automatically get a contact generated by triggered-action-user-contact.json
		return {
			cardType: 'user@1.0.0',
			resourceType: 'user',
		};
	} else if (payloadResource === 'organization') {
		return {
			cardType: 'account@1.0.0',
			resourceType: 'organization',
		};
	} else if (payloadResource === 'subscription') {
		return {
			cardType: 'account@1.0.0',
			resourceType: 'subscription',
		};
	} else if (payloadResource === 'plan') {
		return {
			cardType: 'account@1.0.0',
			resourceType: 'plan',
		};
	}

	// Trying to translate unknown resource
	return {};
}

async function decryptPayload(token: any, payload: any): Promise<any> {
	if (!token.privateKey) {
		throw new Error('Empty private key');
	}

	const key = await jose.JWK.asKey(
		Buffer.from(token.privateKey, 'base64'),
		'pem',
	);

	const decrypter = jose.JWE.createDecrypt(key);
	const plainText = await decrypter.decrypt(payload);

	if (!plainText) {
		throw new Error('Decrypt result was empty');
	}

	const signedToken = plainText.plaintext.toString('utf8');
	const decoded: any = jwt.decode(signedToken);
	const source = decoded!.data!.source;

	const publicKey =
		source === 'api.balena-staging.com'
			? token.staging && token.staging.publicKey
			: token.production && token.production.publicKey;

	if (!publicKey) {
		throw new Error('Empty public key');
	}

	const verificationKey = Buffer.from(publicKey, 'base64');

	return new Promise((resolve, reject) => {
		jwt.verify(signedToken, verificationKey, (error: any, result: any) => {
			if (error) {
				return reject(error);
			}

			return resolve(result.data);
		});
	});
}

export class BalenaAPIIntegration implements Integration {
	public slug = SLUG;
	public context: any;
	public options: any;

	constructor(options: any) {
		this.options = options;
		this.context = this.options.context;
	}

	public async destroy() {
		return Promise.resolve();
	}

	public async mirror(_card: any, _options: any): Promise<any> {
		return [];
	}

	// Translate an external webhook event from the balena API.
	// Flowchart: https://docs.google.com/drawings/d/162ZuOsj-d_U0mw6YaWgCl7SmkApN3-4UL0O5WK9PkOw/edit?usp=sharing
	//
	// The translate process goes through the following steps.
	// 1. Decrypt the event payload
	// 2. Ignore empty or useless payloads
	// 3. Define the type of card that will be created
	// 4. Get any pre-existing card for this event
	// 5. Merge card with payload
	// 			1. Update or create field values
	// 			2. If there is an ip attached to the payload use it to retrieve an address and set it on the card
	// 6. Set Actor of translate event
	// 7. Build up translate sequence
	public async translate(event: any): Promise<any> {
		// 1. Decrypt the event payload
		this.context.log.info('Balena-API Translate: Decrypt event payload');

		let payload: any = null;

		try {
			payload = await decryptPayload(this.options.token, event.data.payload);
		} catch (error) {
			this.context.log.exception(
				'Balena-API Translate: failed to decrypt payload',
				error,
			);

			// Return early when payload is empty
			return [];
		}

		this.context.log.info('Balena-API Translate: print payload', payload);

		// Ignore create events with no useful information
		// TODO: Ensure that balenaAPI sends meaningful webhook data when a resource is created
		if (payload.type === 'create') {
			// If payload doesn't contain the username we can ignore this update event
			if (userCreateContainsUsername(payload) === false) {
				this.context.log.info(
					"Balena-API Translate: create event doesn't contain username, ignoring translate event",
				);
				return [];
			}
		}

		// 3. Define the type of card that will be created and the source resource type
		const { cardType, resourceType } = getCardAndResourceType(payload.resource);

		if (!cardType || !resourceType) {
			this.context.log.info(
				`Balena-API Translate: not translating unknown resource ${payload.resource}`,
				payload,
			);
			return [];
		}

		this.context.log.info(
			`Balena-API Translate: translating Balena ${payload.resource} => Jellyfish ${cardType}`,
		);

		// 4. Get pre-existing card
		this.context.log.info('Balena-API Translate: Get pre-existing card');

		const preExistingCard = await getPreExistingCard(
			this.context,
			payload,
			resourceType,
			cardType,
		);

		// 5. Merge card with payload
		this.context.log.info('Balena-API Translate: Merge card with payload');

		const newCard = mergeCardWithPayload(
			preExistingCard,
			payload,
			resourceType,
			cardType,
		);

		// 6. Set actor of translate event
		this.context.log.info('Balena-API Translate: Set actor of translate event');

		// The Balena API doesn't emit actors in events, so most
		// of them will be done by the admin user.
		const actor = await this.context.getActorId({
			handle: this.options.defaultUser,
		});

		// 7. build up translate sequence
		this.context.log.info('Balena-API Translate: build up translate sequence');

		const sequence: any[] = [];
		sequence.push(
			makeCard(newCard, actor, _.get(newCard, ['data', 'translateDate'])),
		);

		this.context.log.info(
			'Balena-API Translate: Translating Balena API updates',
			{
				sequence,
			},
		);

		return sequence;
	}
}

const whoami = async (
	logContext: LogContext,
	credentials: any,
	retries = 10,
): Promise<any> => {
	const { code: statusCode, body: externalUser } = await new Promise(
		(resolve: any, reject: any) => {
			axios
				.get(`${integration.oauthBaseUrl}/user/v1/whoami`, {
					headers: {
						Authorization: `${credentials.token_type} ${credentials.access_token}`,
					},
				})
				.then((response) => {
					return resolve({
						code: response.status,
						body: response.data,
					});
				})
				.catch((error) => {
					if (error.response && error.response.status === RATE_LIMIT_CODE) {
						return resolve({
							code: error.response.status,
							body: error.response.data || '',
						});
					}
					return reject(error);
				});
		},
	);

	// Take rate limiting into account
	if (statusCode === RATE_LIMIT_CODE && retries > 0) {
		await new Promise((resolve) => {
			setTimeout(resolve, 5000);
		});
		return whoami(logContext, credentials, retries - 1);
	}

	assert.INTERNAL(
		logContext,
		externalUser && statusCode === 200,
		syncErrors.SyncExternalRequestError,
		`Failed to fetch user information from balena-api. Response status code: ${statusCode}`,
	);

	return externalUser;
};

const match = (context: SyncActionContext, externalUser: any): any => {
	assert.INTERNAL(
		null,
		externalUser,
		syncErrors.SyncInvalidArg,
		'External user is a required parameter',
	);

	const slug = `user-${utils.slugify(externalUser.username)}@latest`;
	return context.getElementBySlug(slug);
};

const getExternalUserSyncEventData = async (
	context: any,
	externalUser: any,
): Promise<any> => {
	assert.INTERNAL(
		context,
		externalUser,
		syncErrors.SyncInvalidArg,
		'External user is a required parameter',
	);

	const event: any = {
		source: 'balena-api',
		headers: {
			accept: '*/*',
			connection: 'close',
			'content-type': 'application/jose',
		},
		payload: {
			timestamp: new Date().toISOString(),
			resource: 'user',
			source: 'api.balena-cloud.com',
			type: 'create',
			payload: externalUser,
		},
	};

	const signedToken = jwt.sign(
		{
			data: event.payload,
		},
		Buffer.from(integration.privateKey, 'base64'),
		{
			algorithm: 'ES256',
			expiresIn: 10 * 60 * 1000,
			audience: 'jellyfish',
			issuer: 'api.balena-cloud.com',
			jwtid: randomstring.generate(20),
			subject: `${event.payload.id}`,
		},
	);

	const keyValue = Buffer.from(integration.production.publicKey, 'base64');
	const encryptionKey = await jose.JWK.asKey(keyValue, 'pem');

	const cipher = jose.JWE.createEncrypt(
		{
			format: 'compact',
		},
		encryptionKey,
	);
	cipher.update(signedToken);

	const result = await cipher.final();
	event.payload = result;
	return event;
};

export const balenaApiIntegrationDefinition: IntegrationDefinition = {
	initialize: async (options) => new BalenaAPIIntegration(options),
	isEventValid: async (
		context,
		token,
		rawEvent,
		_headers,
	): Promise<boolean> => {
		if (!token) {
			return false;
		}

		try {
			await decryptPayload(token, rawEvent);
		} catch (error: any) {
			logger.exception(
				context,
				'Balena-API Translate: failed to decrypt payload when checking if event is valid',
				error,
			);

			return false;
		}

		return true;
	},
	OAUTH_BASE_URL: integration.oauthBaseUrl,
	OAUTH_SCOPES: [],
	whoami,
	match,
	getExternalUserSyncEventData,
	mergeCardWithPayload,
};
